import type {
  ScriptExecutionContext,
  ScriptExecutionResult,
  ScriptLogEntry,
  ScriptTestResult,
  SendRequestResult,
  SendRequestSpec,
  VariableChange,
  VariableScope,
} from "../types";
import { createAliases, createScriptApi, type RuntimeState } from "../api/create-api";
import { validateScript } from "../parser/validate";

export interface WorkerExecuteMessage {
  type: "execute";
  id: string;
  script: string;
  context: ScriptExecutionContext;
}

export interface WorkerCancelMessage {
  type: "cancel";
  id: string;
}

export interface WorkerSendRequestMessage {
  type: "sendRequest";
  id: string;
  executionId: string;
  spec: SendRequestSpec;
}

export interface WorkerSendRequestResultMessage {
  type: "sendRequestResult";
  id: string;
  executionId: string;
  result?: SendRequestResult;
  error?: string;
}

export interface WorkerLogMessage {
  type: "log";
  executionId: string;
  entry: Omit<ScriptLogEntry, "id" | "timestamp">;
}

export interface WorkerCompleteMessage {
  type: "complete";
  executionId: string;
  result: ScriptExecutionResult;
}

export interface WorkerErrorMessage {
  type: "error";
  executionId: string;
  error: { message: string; stack?: string; line?: number; column?: number };
}

export type WorkerInboundMessage =
  | WorkerExecuteMessage
  | WorkerCancelMessage
  | WorkerSendRequestResultMessage;

export type WorkerOutboundMessage =
  | WorkerLogMessage
  | WorkerCompleteMessage
  | WorkerErrorMessage
  | { type: "sendRequest"; executionId: string; requestId: string; spec: SendRequestSpec };

const activeExecutions = new Map<
  string,
  { aborted: boolean; timeoutId: ReturnType<typeof setTimeout> }
>();

const pendingSendRequests = new Map<
  string,
  {
    resolve: (result: SendRequestResult) => void;
    reject: (error: Error) => void;
  }
>();

function generateId(): string {
  return crypto.randomUUID();
}

function buildRuntimeState(
  context: ScriptExecutionContext,
): RuntimeState {
  const variables = { ...context.variables.local };
  for (const scope of [
    "folder",
    "collection",
    "environment",
    "workspace",
    "global",
    "system",
  ] as VariableScope[]) {
    Object.assign(variables, context.variables[scope]);
  }

  return {
    request: structuredClone(context.request),
    response: context.response ? structuredClone(context.response) : undefined,
    variables,
    variableScopes: structuredClone(context.variables),
    cookies: { ...(context.cookies ?? {}) },
    aborted: false,
    tests: [],
    nextRequestName: null,
    iterationData: { ...(context.iterationData ?? {}) },
    requestName: context.requestName ?? "",
    iteration: context.iteration ?? 1,
    iterationCount: context.iterationCount ?? 1,
  };
}

async function executeScript(
  executionId: string,
  script: string,
  context: ScriptExecutionContext,
): Promise<ScriptExecutionResult> {
  const start = performance.now();
  const logs: ScriptLogEntry[] = [];
  const variableChanges: VariableChange[] = [];
  const cookieChanges: Array<{ name: string; value: string }> = [];
  let requestChanges: RuntimeState["request"] | undefined;

  const validation = validateScript(script);
  if (!validation.valid) {
    return {
      success: false,
      durationMs: performance.now() - start,
      logs,
      tests: [],
      variableChanges,
      aborted: false,
      error: validation.error,
    };
  }

  const state = buildRuntimeState(context);

  const callbacks = {
    onLog: (entry: Omit<ScriptLogEntry, "id" | "timestamp">) => {
      const logEntry: ScriptLogEntry = {
        ...entry,
        id: generateId(),
        timestamp: Date.now(),
      };
      logs.push(logEntry);
      self.postMessage({
        type: "log",
        executionId,
        entry,
      } satisfies WorkerLogMessage);
    },
    onVariableChange: (change: VariableChange) => {
      variableChanges.push(change);
    },
    onRequestChange: (changes: Partial<RuntimeState["request"]>) => {
      Object.assign(state.request, changes);
      requestChanges = structuredClone(state.request);
    },
    onTest: (result: ScriptTestResult) => {
      state.tests.push(result);
    },
    onCookieChange: (change: { name: string; value: string }) => {
      cookieChanges.push(change);
    },
    sendRequest: (spec: SendRequestSpec) =>
      new Promise<SendRequestResult>((resolve, reject) => {
        const requestId = generateId();
        pendingSendRequests.set(requestId, { resolve, reject });
        self.postMessage({
          type: "sendRequest",
          executionId,
          requestId,
          spec,
        });
      }),
  };

  const api = createScriptApi(
    state,
    callbacks,
    context.scriptType,
    context.requestId,
  );
  const { fm, fishman, pm, bru } = createAliases(api);

  const res = state.response
    ? {
        getStatus: () => state.response!.status,
        getBody: () => {
          try {
            return JSON.parse(state.response!.body);
          } catch {
            return state.response!.body;
          }
        },
        getHeaders: () => state.response!.headers,
        getResponseTime: () => state.response!.time,
      }
    : undefined;

  const wrappedScript = `"use strict";\nreturn (async () => {\n${script}\n})();`;

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>;

    const fn = new AsyncFunction(
      "fm",
      "fishman",
      "pm",
      "bru",
      "res",
      "console",
      "fetch",
      "JSON",
      "URL",
      "URLSearchParams",
      "TextEncoder",
      "TextDecoder",
      "crypto",
      "AbortController",
      "setTimeout",
      "clearTimeout",
      "Promise",
      "Array",
      "Object",
      "String",
      "Number",
      "Boolean",
      "Date",
      "Math",
      "RegExp",
      "Map",
      "Set",
      "Error",
      wrappedScript,
    );

    await fn(
      fm,
      fishman,
      pm,
      bru,
      res,
      fm.console,
      fetch,
      JSON,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      crypto,
      AbortController,
      setTimeout,
      clearTimeout,
      Promise,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      Math,
      RegExp,
      Map,
      Set,
      Error,
    );

    const hasFailedTests = state.tests.some((t) => t.status === "failed");

    return {
      success: !hasFailedTests,
      durationMs: performance.now() - start,
      logs,
      tests: state.tests,
      variableChanges,
      cookieChanges,
      requestChanges,
      aborted: state.aborted,
      nextRequestName: state.nextRequestName,
    };
  } catch (error) {
    const err = error as Error & { lineNumber?: number; columnNumber?: number };
    const message = err.message ?? "Script execution failed";
    logs.push({
      id: generateId(),
      timestamp: Date.now(),
      level: "error",
      message,
      scriptType: context.scriptType,
      requestId: context.requestId,
    });
    return {
      success: false,
      durationMs: performance.now() - start,
      logs,
      tests: state.tests,
      variableChanges,
      cookieChanges,
      requestChanges,
      aborted: state.aborted,
      nextRequestName: state.nextRequestName,
      error: {
        message,
        stack: err.stack,
        line: err.lineNumber,
        column: err.columnNumber,
      },
    };
  }
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === "cancel") {
    const active = activeExecutions.get(message.id);
    if (active) {
      active.aborted = true;
      clearTimeout(active.timeoutId);
      activeExecutions.delete(message.id);
    }
    return;
  }

  if (message.type === "sendRequestResult") {
    const pending = pendingSendRequests.get(message.id);
    if (!pending) return;
    pendingSendRequests.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error));
    } else if (message.result) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error("No response from sendRequest"));
    }
    return;
  }

  if (message.type !== "execute") return;

  const { id: executionId, script, context } = message;
  const timeoutMs = context.timeoutMs ?? 5000;

  const timeoutId = setTimeout(() => {
    activeExecutions.delete(executionId);
    const result: ScriptExecutionResult = {
      success: false,
      durationMs: timeoutMs,
      logs: [],
      tests: [],
      variableChanges: [],
      aborted: true,
      error: { message: `Script execution timed out after ${timeoutMs}ms` },
    };
    self.postMessage({
      type: "complete",
      executionId,
      result,
    } satisfies WorkerCompleteMessage);
  }, timeoutMs);

  activeExecutions.set(executionId, { aborted: false, timeoutId });

  try {
    const result = await executeScript(executionId, script, context);
    clearTimeout(timeoutId);
    activeExecutions.delete(executionId);

    self.postMessage({
      type: "complete",
      executionId,
      result,
    } satisfies WorkerCompleteMessage);
  } catch (error) {
    clearTimeout(timeoutId);
    activeExecutions.delete(executionId);
    const err = error as Error;
    self.postMessage({
      type: "error",
      executionId,
      error: { message: err.message, stack: err.stack },
    } satisfies WorkerErrorMessage);
  }
};

export {};
