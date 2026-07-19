import type {
  ScriptLogEntry,
  ScriptLogLevel,
  ScriptRequestState,
  ScriptResponseState,
  ScriptTestResult,
  ScriptType,
  SendRequestResult,
  SendRequestSpec,
  VariableChange,
  VariableScope,
} from "../types";
import { createExpect, createResponseExpect } from "../assertions/expect";

export interface RuntimeCallbacks {
  onLog: (entry: Omit<ScriptLogEntry, "id" | "timestamp">) => void;
  onVariableChange: (change: VariableChange) => void;
  onRequestChange: (changes: Partial<ScriptRequestState>) => void;
  onTest: (result: ScriptTestResult) => void;
  onCookieChange: (change: { name: string; value: string }) => void;
  sendRequest: (spec: SendRequestSpec) => Promise<SendRequestResult>;
}

export interface RuntimeState {
  request: ScriptRequestState;
  response?: ScriptResponseState;
  variables: Record<string, string>;
  variableScopes: Record<VariableScope, Record<string, string>>;
  cookies: Record<string, string>;
  aborted: boolean;
  tests: ScriptTestResult[];
  nextRequestName: string | null;
  iterationData: Record<string, unknown>;
  requestName: string;
  iteration: number;
  iterationCount: number;
}

function createConsole(
  scriptType: ScriptType,
  requestId: string,
  onLog: RuntimeCallbacks["onLog"],
) {
  const log = (level: ScriptLogLevel, args: unknown[]) => {
    const message = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

    onLog({ level, message, scriptType, requestId });
  };

  return {
    log: (...args: unknown[]) => log("log", args),
    info: (...args: unknown[]) => log("info", args),
    warn: (...args: unknown[]) => log("warn", args),
    error: (...args: unknown[]) => log("error", args),
    debug: (...args: unknown[]) => log("debug", args),
    table: (data: unknown) => log("table", [data]),
  };
}

function headersToRecord(
  headers: Record<string, string>,
): Record<string, string> {
  return { ...headers };
}

export function createScriptApi(
  state: RuntimeState,
  callbacks: RuntimeCallbacks,
  scriptType: ScriptType,
  requestId: string,
) {
  const consoleApi = createConsole(scriptType, requestId, callbacks.onLog);

  const setVar = (key: string, value: string, scope: VariableScope = "local") => {
    state.variableScopes[scope][key] = value;
    state.variables[key] = value;
    callbacks.onVariableChange({ key, value, scope });
  };

  const getVar = (key: string): string | undefined => {
    return state.variables[key];
  };

  const requestApi = {
    get method() {
      return state.request.method;
    },
    get url() {
      return state.request.url;
    },
    get path() {
      try {
        return new URL(state.request.url).pathname;
      } catch {
        return state.request.url;
      }
    },
    get query() {
      try {
        const url = new URL(state.request.url);
        return Object.fromEntries(url.searchParams.entries());
      } catch {
        return state.request.params;
      }
    },
    get headers() {
      return headersToRecord(state.request.headers);
    },
    get body() {
      return state.request.body;
    },
    get auth() {
      return state.request.auth;
    },
    get cookies() {
      return { ...state.cookies };
    },
    setMethod(method: string) {
      state.request.method = method as ScriptRequestState["method"];
      callbacks.onRequestChange({ method: state.request.method });
    },
    setURL(url: string) {
      state.request.url = url;
      callbacks.onRequestChange({ url });
    },
    setHeader(key: string, value: string) {
      state.request.headers[key] = value;
      callbacks.onRequestChange({ headers: { ...state.request.headers } });
    },
    removeHeader(key: string) {
      delete state.request.headers[key];
      callbacks.onRequestChange({ headers: { ...state.request.headers } });
    },
    setBody(body: string | object | number | boolean | null) {
      const text =
        typeof body === "string"
          ? body
          : body === undefined
            ? ""
            : JSON.stringify(body);
      state.request.body = text;

      // Objects become JSON body; string body upgrades "none" → raw so it is sent.
      if (body !== null && typeof body === "object") {
        state.request.bodyType = "json";
        if (!state.request.headers["Content-Type"] && !state.request.headers["content-type"]) {
          state.request.headers["Content-Type"] = "application/json";
        }
      } else if (state.request.bodyType === "none" && text.length > 0) {
        state.request.bodyType = "raw";
      }

      callbacks.onRequestChange({
        body: text,
        bodyType: state.request.bodyType,
        headers: { ...state.request.headers },
      });
    },
    addQuery(key: string, value: string) {
      try {
        const url = new URL(state.request.url);
        url.searchParams.set(key, value);
        state.request.url = url.toString();
      } catch {
        state.request.params[key] = value;
      }
      callbacks.onRequestChange({
        url: state.request.url,
        params: { ...state.request.params },
      });
    },
    removeQuery(key: string) {
      try {
        const url = new URL(state.request.url);
        url.searchParams.delete(key);
        state.request.url = url.toString();
      } catch {
        delete state.request.params[key];
      }
      callbacks.onRequestChange({
        url: state.request.url,
        params: { ...state.request.params },
      });
    },
    abort() {
      state.aborted = true;
    },
  };

  const responseApi = state.response
    ? {
        get status() {
          return state.response!.status;
        },
        get statusText() {
          return state.response!.statusText;
        },
        get headers() {
          return headersToRecord(state.response!.headers);
        },
        get cookies() {
          return {};
        },
        get body() {
          return state.response!.body;
        },
        get size() {
          return state.response!.size;
        },
        get time() {
          return state.response!.time;
        },
        get responseSize() {
          return state.response!.size;
        },
        json() {
          const body = state.response!.body;
          try {
            return JSON.parse(body);
          } catch {
            const trimmed = body.trimStart();
            const preview = trimmed.slice(0, 80).replace(/\s+/g, " ");
            if (trimmed.startsWith("<")) {
              throw new Error(
                `Response is not JSON — body looks like HTML. Use fm.response.text() instead.${preview ? ` Starts with: "${preview}…"` : ""}`,
              );
            }
            throw new Error(
              `Response is not valid JSON.${preview ? ` Body starts with: "${preview}…"` : ""}`,
            );
          }
        },
        text() {
          return state.response!.body;
        },
        getHeader(name: string) {
          const key = Object.keys(state.response!.headers).find(
            (h) => h.toLowerCase() === name.toLowerCase(),
          );
          return key ? state.response!.headers[key] : undefined;
        },
        hasHeader(name: string) {
          return Object.keys(state.response!.headers).some(
            (h) => h.toLowerCase() === name.toLowerCase(),
          );
        },
        to: createResponseExpect(state.response),
      }
    : undefined;

  const variablesApi = {
    get: getVar,
    set: setVar,
    unset: (key: string) => {
      for (const scope of Object.keys(state.variableScopes) as VariableScope[]) {
        delete state.variableScopes[scope][key];
      }
      delete state.variables[key];
    },
    clear: (scope?: VariableScope) => {
      if (scope) {
        state.variableScopes[scope] = {};
      }
    },
    replaceIn: (text: string) =>
      text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
        const value = getVar(rawKey.trim());
        return value !== undefined ? value : match;
      }),
    exists: (key: string) => getVar(key) !== undefined,
    get all() {
      return { ...state.variables };
    },
  };

  const environmentApi = {
    get: (key: string) =>
      state.variableScopes.environment[key] ??
      state.variableScopes.global[key],
    set: (key: string, value: string) => setVar(key, value, "environment"),
    unset: (key: string) => {
      delete state.variableScopes.environment[key];
      delete state.variables[key];
    },
    get all() {
      return {
        ...state.variableScopes.global,
        ...state.variableScopes.environment,
      };
    },
  };

  const testApi = (name: string, fn: () => void) => {
    const start = performance.now();
    try {
      fn();
      const result: ScriptTestResult = {
        name,
        status: "passed",
        durationMs: performance.now() - start,
      };
      state.tests.push(result);
      callbacks.onTest(result);
    } catch (error) {
      const err = error as Error;
      const result: ScriptTestResult = {
        name,
        status: "failed",
        durationMs: performance.now() - start,
        error: { message: err.message, stack: err.stack },
      };
      state.tests.push(result);
      callbacks.onTest(result);
    }
  };

  const api = {
    request: requestApi,
    /** Bruno-style alias for `request` */
    req: requestApi,
    response: responseApi,
    environment: environmentApi,
    collectionVariables: variablesApi,
    globals: {
      get: (key: string) => state.variableScopes.global[key],
      set: (key: string, value: string) => setVar(key, value, "global"),
      unset: (key: string) => delete state.variableScopes.global[key],
      get all() {
        return { ...state.variableScopes.global };
      },
    },
    variables: variablesApi,
    cookies: {
      get: (name: string) => state.cookies[name],
      set: (name: string, value: string) => {
        state.cookies[name] = value;
        callbacks.onCookieChange({ name, value });
      },
    },
    iterationData: {
      get: (key: string) => state.iterationData[key],
      get all() {
        return { ...state.iterationData };
      },
    },
    visualizer: { set: (_template: string, _data: unknown) => undefined },
    console: consoleApi,
    test: testApi,
    expect: createExpect,
    sendRequest: async (spec: SendRequestSpec) => {
      const result = await callbacks.sendRequest(spec);
      return {
        code: result.status,
        status: result.statusText,
        headers: result.headers,
        body: result.body,
        json: () => JSON.parse(result.body),
        text: () => result.body,
        responseTime: result.time,
      };
    },
    execution: {
      skipRequest: () => {
        state.aborted = true;
      },
      setNextRequest: (name: string) => {
        const trimmed = name?.trim();
        state.nextRequestName = trimmed ? trimmed : null;
      },
    },
    info: {
      requestId,
      requestName: state.requestName || state.request.url,
      iteration: state.iteration,
      iterationCount: state.iterationCount,
    },
  };

  return api;
}

export function createAliases(api: ReturnType<typeof createScriptApi>) {
  const bruApi = {
    ...api,
    setVar: (key: string, value: string) => api.collectionVariables.set(key, value),
    getVar: (key: string) => api.collectionVariables.get(key),
    getEnvVar: (key: string) => api.environment.get(key),
    setEnvVar: (key: string, value: string) => api.environment.set(key, value),
    getBody: () => api.response?.body,
    getStatus: () => api.response?.status,
  };

  return {
    /** Primary Fishman script API (short alias) */
    fm: api,
    /** Primary Fishman script API */
    fishman: api,
    /** @deprecated Postman compatibility alias — use `fm` or `fishman` */
    pm: api,
    /** @deprecated Bruno compatibility alias — use `fm` or `fishman` */
    bru: bruApi,
  };
}
