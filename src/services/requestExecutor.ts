import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type { StoredCookie, CookieChange } from "@/types/cookie";
import type { CollectionFolder } from "@/types/collection";
import type {
  ScriptLogEntry,
  ScriptPipelineResult,
  ScriptTestResult,
  ScriptVariableMap,
  SendRequestSpec,
  VariableChange,
} from "@/script-engine/types";
import {
  applyScriptRequestChanges,
  buildScriptVariables,
  requestDraftToScriptState,
  responseToScriptState,
  scriptEngine,
  variablesToRecord,
} from "@/script-engine";
import { buildRequestPayload } from "@/utils/requestBuilder";
import { executeRequest } from "@/tauri/http";
import {
  findUnresolvedVariables,
  substituteRequestDraft,
} from "@/utils/variableSubstitution";
import { validateRequest } from "@/utils/validation";
import {
  cookiesToNameMap,
  createStoredCookie,
  normalizeDomain,
  selectCookiesForUrl,
} from "@/utils/cookies";
import {
  applyEffectiveRequest,
  buildFolderChain,
  collectPostResponseVars,
  extractJsonPath,
  joinScripts,
} from "@/collections/inheritance";

function applyCookieChangesLocally(
  jar: StoredCookie[],
  requestUrl: string,
  changes: CookieChange[] | undefined,
): StoredCookie[] {
  if (!changes?.length) return jar;
  let host = "";
  try {
    host = new URL(requestUrl).hostname;
  } catch {
    return jar;
  }
  const domain = normalizeDomain(host);
  let next = [...jar];
  for (const change of changes) {
    const existing = next.find(
      (c) =>
        c.domain === domain &&
        c.name === change.name &&
        c.path === "/",
    );
    const stored = createStoredCookie(
      {
        domain,
        name: change.name,
        value: change.value,
        path: "/",
      },
      existing?.id,
    );
    next = next.filter(
      (c) =>
        !(
          c.domain === domain &&
          c.name === change.name &&
          c.path === "/"
        ),
    );
    next.push(stored);
  }
  return next;
}

export interface RequestExecutorSettings {
  ignoreSsl: boolean;
  timeoutMs: number;
}

export interface ExecuteOneRequestInput {
  request: RequestDraft;
  variables: Record<string, string>;
  cookies: StoredCookie[];
  settings: RequestExecutorSettings;
  /** Folders for collection/folder inheritance (Send + Runner). */
  folders?: CollectionFolder[];
  /** Human-readable name for scripts (`fishman.info.requestName`). */
  requestName?: string;
  iterationData?: Record<string, unknown>;
  iteration?: number;
  iterationCount?: number;
  signal?: AbortSignal;
  /** When set, used instead of default nested HTTP from scripts. */
  onSendRequest?: (spec: SendRequestSpec) => Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    time: number;
  }>;
}

export interface ExecuteOneRequestResult {
  request: RequestDraft;
  resolvedRequest: RequestDraft;
  response: ApiResponse | null;
  skipped: boolean;
  skipReason?: string;
  nextRequestName?: string | null;
  pipeline: ScriptPipelineResult;
  scriptVariables: ScriptVariableMap;
  variables: Record<string, string>;
  logs: ScriptLogEntry[];
  tests: ScriptTestResult[];
  durationMs: number;
  errorMessage?: string;
}

function buildNestedExecutor(
  settings: RequestExecutorSettings,
  variables: Record<string, string>,
  cookies: StoredCookie[],
) {
  return async (spec: SendRequestSpec) => {
    const nestedDraft: RequestDraft = {
      id: crypto.randomUUID(),
      name: "Nested Request",
      method: (spec.method ?? "GET") as RequestDraft["method"],
      url: spec.url,
      params: [],
      headers: Object.entries(spec.headers ?? {}).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value,
        enabled: true,
      })),
      bodyType: spec.body ? "raw" : "none",
      body: spec.body ?? "",
      formDataFields: [],
      auth: { type: "none" },
      scripts: { preRequest: "", postResponse: "", tests: "" },
    };

    const payload = buildRequestPayload(nestedDraft, {
      ignoreSsl: settings.ignoreSsl,
      timeoutMs: settings.timeoutMs,
      variables,
      cookies,
    });
    const response = await executeRequest(payload);
    return {
      status: response.status,
      statusText: response.status_text,
      headers: response.headers,
      body: response.body,
      time: response.duration_ms,
    };
  };
}

function collectLogs(pipeline: ScriptPipelineResult): ScriptLogEntry[] {
  return [
    ...(pipeline.preRequest?.logs ?? []),
    ...(pipeline.postResponse?.logs ?? []),
    ...(pipeline.tests?.logs ?? []),
  ];
}

function collectTests(pipeline: ScriptPipelineResult): ScriptTestResult[] {
  return [
    ...(pipeline.preRequest?.tests ?? []),
    ...(pipeline.postResponse?.tests ?? []),
    ...(pipeline.tests?.tests ?? []),
  ];
}

function collectCookieChanges(
  pipeline: ScriptPipelineResult,
): CookieChange[] {
  return [
    ...(pipeline.preRequest?.cookieChanges ?? []),
    ...(pipeline.postResponse?.cookieChanges ?? []),
    ...(pipeline.tests?.cookieChanges ?? []),
  ];
}

export function getPipelineCookieChanges(
  pipeline: ScriptPipelineResult,
): CookieChange[] {
  return collectCookieChanges(pipeline);
}

function collectVariableChanges(
  pipeline: ScriptPipelineResult,
): VariableChange[] {
  return [
    ...(pipeline.preRequest?.variableChanges ?? []),
    ...(pipeline.postResponse?.variableChanges ?? []),
    ...(pipeline.tests?.variableChanges ?? []),
  ];
}

export function getPipelineVariableChanges(
  pipeline: ScriptPipelineResult,
): VariableChange[] {
  return collectVariableChanges(pipeline);
}

/**
 * Shared pre-script → HTTP → post-script/tests pipeline used by tab Send
 * and the Collection Runner.
 */
export async function executeOneRequest(
  input: ExecuteOneRequestInput,
): Promise<ExecuteOneRequestResult> {
  const started = performance.now();
  let request = input.request;
  let variables = { ...input.variables };
  let jarCookies = input.cookies;

  const chain = buildFolderChain(request.collectionId, input.folders ?? []);
  const effective = applyEffectiveRequest(request, chain);
  request = effective.request;
  variables = {
    ...effective.folderVariables,
    ...variables,
  };

  const combinedPre = joinScripts([
    ...effective.folderScripts.preRequest,
    request.scripts?.preRequest ?? "",
  ]);
  const combinedPost = joinScripts([
    request.scripts?.postResponse ?? "",
    ...effective.folderScripts.postResponse,
  ]);
  const combinedTests = joinScripts([
    request.scripts?.tests ?? "",
    ...effective.folderScripts.tests,
  ]);

  if (input.iterationData) {
    for (const [key, value] of Object.entries(input.iterationData)) {
      if (value === undefined || value === null) continue;
      variables[key] = typeof value === "string" ? value : String(value);
    }
  }

  const requestName = input.requestName ?? request.name;
  const nested =
    input.onSendRequest ??
    buildNestedExecutor(input.settings, variables, jarCookies);

  const throwIfAborted = () => {
    if (input.signal?.aborted) {
      throw new Error("Run cancelled");
    }
  };

  throwIfAborted();

  const scriptVariables = buildScriptVariables(variables);
  const requestCookies = cookiesToNameMap(
    selectCookiesForUrl(jarCookies, request.url),
  );

  const prePipeline = await scriptEngine.runPipeline({
    requestId: request.id,
    requestName,
    request: requestDraftToScriptState(request),
    preRequestScript: combinedPre,
    variables: scriptVariables,
    cookies: requestCookies,
    iterationData: input.iterationData,
    iteration: input.iteration,
    iterationCount: input.iterationCount,
    options: {
      timeoutMs: 10_000,
      onSendRequest: nested,
      signal: input.signal,
    },
  });

  variables = {
    ...variables,
    ...variablesToRecord(prePipeline.variables),
  };

  jarCookies = applyCookieChangesLocally(
    jarCookies,
    request.url,
    prePipeline.preRequest?.cookieChanges,
  );

  if (prePipeline.aborted) {
    return {
      request: applyScriptRequestChanges(request, prePipeline.request),
      resolvedRequest: request,
      response: null,
      skipped: true,
      skipReason: "skipRequest",
      nextRequestName: prePipeline.nextRequestName,
      pipeline: prePipeline,
      scriptVariables: prePipeline.variables,
      variables,
      logs: collectLogs(prePipeline),
      tests: collectTests(prePipeline),
      durationMs: performance.now() - started,
    };
  }

  if (prePipeline.preRequest && !prePipeline.preRequest.success) {
    const message =
      prePipeline.preRequest.error?.message ?? "Pre-request script failed";
    return {
      request: applyScriptRequestChanges(request, prePipeline.request),
      resolvedRequest: request,
      response: null,
      skipped: false,
      nextRequestName: prePipeline.nextRequestName,
      pipeline: prePipeline,
      scriptVariables: prePipeline.variables,
      variables,
      logs: collectLogs(prePipeline),
      tests: collectTests(prePipeline),
      durationMs: performance.now() - started,
      errorMessage: message,
    };
  }

  request = applyScriptRequestChanges(request, prePipeline.request);

  const resolvedRequest =
    Object.keys(variables).length > 0
      ? substituteRequestDraft(request, variables)
      : request;

  const unresolvedInUrl = findUnresolvedVariables(resolvedRequest.url);
  if (unresolvedInUrl.length > 0) {
    const validationError = `Unresolved variable(s) in URL: ${unresolvedInUrl.map((name) => `{{${name}}}`).join(", ")}`;
    return {
      request,
      resolvedRequest,
      response: null,
      skipped: false,
      nextRequestName: prePipeline.nextRequestName,
      pipeline: prePipeline,
      scriptVariables: prePipeline.variables,
      variables,
      logs: collectLogs(prePipeline),
      tests: collectTests(prePipeline),
      durationMs: performance.now() - started,
      errorMessage: validationError,
    };
  }

  const validationError = validateRequest(resolvedRequest);
  if (validationError) {
    return {
      request,
      resolvedRequest,
      response: null,
      skipped: false,
      nextRequestName: prePipeline.nextRequestName,
      pipeline: prePipeline,
      scriptVariables: prePipeline.variables,
      variables,
      logs: collectLogs(prePipeline),
      tests: collectTests(prePipeline),
      durationMs: performance.now() - started,
      errorMessage: validationError,
    };
  }

  throwIfAborted();

  const httpStart = performance.now();
  const payload = buildRequestPayload(resolvedRequest, {
    ignoreSsl: input.settings.ignoreSsl,
    timeoutMs: input.settings.timeoutMs,
    variables,
    cookies: jarCookies,
  });
  const response = await executeRequest(payload);

  const postCookies = cookiesToNameMap(
    selectCookiesForUrl(jarCookies, resolvedRequest.url),
  );

  const postPipeline = await scriptEngine.runPipeline({
    requestId: request.id,
    requestName,
    request: requestDraftToScriptState(request),
    postResponseScript: combinedPost,
    testScript: combinedTests,
    response: responseToScriptState(response),
    variables: prePipeline.variables,
    cookies: postCookies,
    iterationData: input.iterationData,
    iteration: input.iteration,
    iterationCount: input.iterationCount,
    options: {
      timeoutMs: 10_000,
      onSendRequest: buildNestedExecutor(
        input.settings,
        variables,
        jarCookies,
      ),
      signal: input.signal,
    },
  });

  variables = {
    ...variables,
    ...variablesToRecord(postPipeline.variables),
  };

  // Collection post-response variable extractors (Bruno-style).
  for (const extractor of collectPostResponseVars(chain)) {
    const value = extractJsonPath(response.body, extractor.expr);
    if (value !== undefined) {
      variables[extractor.key] = value;
    }
  }

  const fullPipeline: ScriptPipelineResult = {
    ...postPipeline,
    preRequest: prePipeline.preRequest,
    nextRequestName:
      postPipeline.nextRequestName ?? prePipeline.nextRequestName,
    timeline: [
      ...prePipeline.timeline,
      {
        stage: "http" as const,
        durationMs: performance.now() - httpStart,
        success: response.status > 0 && !response.error,
        error: response.error ?? undefined,
      },
      ...postPipeline.timeline,
    ],
  };

  const tests = collectTests(fullPipeline);
  const hasFailedTests = tests.some((t) => t.status === "failed");
  const scriptError =
    fullPipeline.postResponse?.error?.message ??
    fullPipeline.tests?.error?.message;

  let errorMessage: string | undefined;
  if (response.error) {
    errorMessage = response.error;
  } else if (scriptError) {
    errorMessage = scriptError;
  } else if (hasFailedTests) {
    const failed = tests.find((t) => t.status === "failed");
    errorMessage = failed?.error?.message ?? `Test failed: ${failed?.name}`;
  }

  return {
    request,
    resolvedRequest,
    response,
    skipped: false,
    nextRequestName: fullPipeline.nextRequestName,
    pipeline: fullPipeline,
    scriptVariables: fullPipeline.variables,
    variables,
    logs: collectLogs(fullPipeline),
    tests,
    durationMs: performance.now() - started,
    errorMessage,
  };
}

export { buildNestedExecutor };
