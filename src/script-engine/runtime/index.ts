import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type {
  ScriptExecutionContext,
  ScriptExecutionOptions,
  ScriptExecutionResult,
  ScriptPipelineInput,
  ScriptPipelineResult,
  ScriptRequestState,
  ScriptResponseState,
  ScriptType,
  ScriptVariableMap,
  SendRequestResult,
  SendRequestSpec,
} from "../types";
import { getSandboxClient } from "../sandbox";
import { mergeVariableMaps, resolveAllVariables } from "../variables";
import { resolveDynamicVariablesIn } from "../builtins";
import { graphqlFromBodyIfPresent } from "@/graphql";

const DEFAULT_TIMEOUT_MS = 10_000;

export function requestDraftToScriptState(
  draft: RequestDraft,
): ScriptRequestState {
  const headers: Record<string, string> = {};
  for (const header of draft.headers) {
    if (header.enabled && header.key) {
      headers[header.key] = header.value;
    }
  }

  const params: Record<string, string> = {};
  for (const param of draft.params) {
    if (param.enabled && param.key) {
      params[param.key] = param.value;
    }
  }

  return {
    method: draft.method,
    url: draft.url,
    headers,
    params,
    body: draft.body,
    bodyType: draft.bodyType,
    auth: structuredClone(draft.auth),
  };
}

export function responseToScriptState(response: ApiResponse): ScriptResponseState {
  return {
    status: response.status,
    statusText: response.status_text,
    headers: response.headers,
    body: response.body,
    size: response.size_bytes,
    time: response.duration_ms,
  };
}

export function applyScriptRequestChanges(
  draft: RequestDraft,
  changes: Partial<ScriptRequestState>,
): RequestDraft {
  // Shallow-copy nested collections before writing — Redux/Immer freezes draft
  // state, and mutating shared header/param objects throws (breaks Send).
  const next: RequestDraft = {
    ...draft,
    headers: draft.headers.map((h) => ({ ...h })),
    params: draft.params.map((p) => ({ ...p })),
    formDataFields: (draft.formDataFields ?? []).map((f) => ({
      ...f,
      filePaths: f.filePaths ? [...f.filePaths] : undefined,
    })),
    auth: structuredClone(draft.auth),
    scripts: draft.scripts
      ? {
          preRequest: draft.scripts.preRequest,
          postResponse: draft.scripts.postResponse,
          tests: draft.scripts.tests,
        }
      : draft.scripts,
  };

  if (changes.method) next.method = changes.method;
  if (changes.url) next.url = changes.url;
  if (changes.body !== undefined) next.body = changes.body;
  if (changes.bodyType) next.bodyType = changes.bodyType;
  if (changes.auth) next.auth = changes.auth;

  // Script contract: body JSON is source of truth for GraphQL — rehydrate config.
  if (
    (changes.body !== undefined || changes.bodyType !== undefined) &&
    (next.bodyType === "graphql" || draft.bodyType === "graphql")
  ) {
    next.graphql = graphqlFromBodyIfPresent(
      next.bodyType,
      next.body,
      next.graphql,
    );
  }

  if (changes.headers) {
    const existing = new Map(next.headers.map((h) => [h.key.toLowerCase(), h]));
    for (const [key, value] of Object.entries(changes.headers)) {
      const found = existing.get(key.toLowerCase());
      if (found) {
        found.value = value;
        found.enabled = true;
      } else {
        next.headers.push({
          id: crypto.randomUUID(),
          key,
          value,
          enabled: true,
        });
      }
    }
  }

  if (changes.params) {
    const existing = new Map(next.params.map((p) => [p.key, p]));
    for (const [key, value] of Object.entries(changes.params)) {
      const found = existing.get(key);
      if (found) {
        found.value = value;
        found.enabled = true;
      } else {
        next.params.push({
          id: crypto.randomUUID(),
          key,
          value,
          enabled: true,
        });
      }
    }
  }

  return next;
}

export class ScriptEngine {
  private readonly sandbox = getSandboxClient();

  async execute(
    script: string,
    scriptType: ScriptType,
    context: Omit<ScriptExecutionContext, "scriptType" | "timeoutMs">,
    options?: ScriptExecutionOptions,
  ): Promise<ScriptExecutionResult> {
    const executionContext: ScriptExecutionContext = {
      ...context,
      scriptType,
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    return this.sandbox.execute(script, executionContext, {
      onSendRequest: options?.onSendRequest,
      signal: options?.signal,
    });
  }

  async runPipeline(input: ScriptPipelineInput): Promise<ScriptPipelineResult> {
    const timeline: ScriptPipelineResult["timeline"] = [];
    let request = structuredClone(input.request);
    let variables = structuredClone(input.variables);
    let aborted = false;
    let nextRequestName: string | null | undefined;

    const baseContext = {
      requestId: input.requestId,
      requestName: input.requestName,
      iterationData: input.iterationData,
      iteration: input.iteration,
      iterationCount: input.iterationCount,
    };

    const sendRequestHandler = input.options?.onSendRequest;

    let preRequest: ScriptExecutionResult | undefined;

    if (input.preRequestScript?.trim()) {
      const start = performance.now();
      preRequest = await this.execute(
        resolveDynamicVariablesIn(input.preRequestScript),
        "pre-request",
        {
          ...baseContext,
          request,
          variables,
          cookies: input.cookies,
        },
        input.options,
      );

      timeline.push({
        stage: "pre-request",
        durationMs: performance.now() - start,
        success: preRequest.success,
        error: preRequest.error?.message,
      });

      for (const change of preRequest.variableChanges) {
        variables = {
          ...variables,
          [change.scope]: {
            ...variables[change.scope],
            [change.key]: change.value,
          },
        };
      }

      if (preRequest.requestChanges) {
        request = { ...request, ...preRequest.requestChanges };
      }

      if (preRequest.nextRequestName) {
        nextRequestName = preRequest.nextRequestName;
      }

      if (preRequest.aborted) {
        aborted = true;
        return {
          request,
          variables,
          preRequest,
          aborted: true,
          nextRequestName,
          timeline,
        };
      }

      if (!preRequest.success) {
        return {
          request,
          variables,
          preRequest,
          aborted: false,
          nextRequestName,
          timeline,
        };
      }
    }

    let postResponse: ScriptExecutionResult | undefined;
    let tests: ScriptExecutionResult | undefined;

    if (input.response) {
      if (input.postResponseScript?.trim()) {
        const start = performance.now();
        postResponse = await this.execute(
          resolveDynamicVariablesIn(input.postResponseScript),
          "post-response",
          {
            ...baseContext,
            request,
            response: input.response,
            variables,
            cookies: input.cookies,
          },
          { ...input.options, onSendRequest: sendRequestHandler },
        );

        timeline.push({
          stage: "post-response",
          durationMs: performance.now() - start,
          success: postResponse.success,
          error: postResponse.error?.message,
        });

        for (const change of postResponse.variableChanges) {
          variables = {
            ...variables,
            [change.scope]: {
              ...variables[change.scope],
              [change.key]: change.value,
            },
          };
        }

        if (postResponse.nextRequestName) {
          nextRequestName = postResponse.nextRequestName;
        }

        if (postResponse.aborted) {
          aborted = true;
        }
      }

      if (input.testScript?.trim()) {
        const start = performance.now();
        tests = await this.execute(
          resolveDynamicVariablesIn(input.testScript),
          "test",
          {
            ...baseContext,
            request,
            response: input.response,
            variables,
            cookies: input.cookies,
          },
          input.options,
        );

        timeline.push({
          stage: "tests",
          durationMs: performance.now() - start,
          success: tests.success,
          error: tests.error?.message,
        });

        for (const change of tests.variableChanges) {
          variables = {
            ...variables,
            [change.scope]: {
              ...variables[change.scope],
              [change.key]: change.value,
            },
          };
        }

        if (tests.nextRequestName) {
          nextRequestName = tests.nextRequestName;
        }
      }
    }

    return {
      request,
      variables,
      preRequest,
      postResponse,
      tests,
      aborted,
      nextRequestName,
      timeline,
    };
  }

  dispose(): void {
    this.sandbox.dispose();
  }
}

export function buildScriptVariables(
  resolved: Record<string, string>,
): ScriptVariableMap {
  return mergeVariableMaps({
    environment: resolved,
    global: resolved,
  });
}

export function variablesToRecord(variables: ScriptVariableMap): Record<string, string> {
  return resolveAllVariables(variables);
}

export async function executeSendRequestInScript(
  spec: SendRequestSpec,
  executor: (spec: SendRequestSpec) => Promise<ApiResponse>,
): Promise<SendRequestResult> {
  const response = await executor(spec);
  return {
    status: response.status,
    statusText: response.status_text,
    headers: response.headers,
    body: response.body,
    time: response.duration_ms,
  };
}

export const scriptEngine = new ScriptEngine();
