/**
 * Fishman script API — available as globals in Pre Request / Post Response / Tests.
 * Type `fm.` for IntelliSense.
 */

interface FishmanResApi {
  getStatus(): number;
  getBody(): unknown;
  getHeaders(): Record<string, string>;
  getResponseTime(): number;
}

interface FishmanScriptApi {
  /** Outgoing request (also available as `fm.req`) */
  request: FishmanRequestApi;
  /** Alias for `request` (Bruno-style) */
  req: FishmanRequestApi;
  /** Response — only in Post Response / Tests scripts */
  response?: FishmanResponseApi;
  /** Active environment variables */
  environment: FishmanVariablesApi;
  collectionVariables: FishmanVariablesApi;
  globals: FishmanVariablesApi;
  /** Local / temporary variables for this request */
  variables: FishmanVariablesApi;
  cookies: FishmanCookiesApi;
  iterationData: { get(key: string): unknown; all: Record<string, unknown> };
  visualizer: { set(template: string, data: unknown): void };
  console: FishmanConsoleApi;
  /** Register a named test assertion (Tests / Post Response) */
  test(name: string, fn: () => void): void;
  expect(value: unknown): FishmanExpectation;
  sendRequest(spec: FishmanSendRequestSpec): Promise<FishmanSendRequestResponse>;
  execution: {
    skipRequest(): void;
    setNextRequest(name: string): void;
  };
  info: {
    requestId: string;
    requestName: string;
    iteration: number;
    iterationCount: number;
  };
}

interface FishmanBruApi extends FishmanScriptApi {
  setVar(key: string, value: string): void;
  getVar(key: string): string | undefined;
  getEnvVar(key: string): string | undefined;
  setEnvVar(key: string, value: string): void;
  getBody(): string | undefined;
  getStatus(): number | undefined;
}

interface FishmanRequestApi {
  method: string;
  url: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  auth: unknown;
  cookies: Record<string, string>;
  setMethod(method: string): void;
  setURL(url: string): void;
  /** Set a request header, e.g. fm.request.setHeader("X-Demo", "1") */
  setHeader(key: string, value: string): void;
  removeHeader(key: string): void;
  /**
   * Set the request body. Pass a string, or an object (auto JSON.stringify + json body type).
   * @example fm.request.setBody({ name: "Fishman" })
   * @example fm.request.setBody(JSON.stringify({ name: "Fishman" }))
   */
  setBody(body: string | object | number | boolean | null): void;
  addQuery(key: string, value: string): void;
  removeQuery(key: string): void;
  abort(): void;
}

interface FishmanResponseApi {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: string;
  size: number;
  time: number;
  responseSize: number;
  json(): unknown;
  text(): string;
  getHeader(name: string): string | undefined;
  hasHeader(name: string): boolean;
  to: FishmanResponseExpectation;
}

interface FishmanVariablesApi {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  unset(key: string): void;
  clear(scope?: string): void;
  replaceIn(text: string): string;
  exists(key: string): boolean;
  all: Record<string, string>;
}

interface FishmanCookiesApi {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

interface FishmanConsoleApi {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  table(data: unknown): void;
}

interface FishmanSendRequestSpec {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface FishmanSendRequestResponse {
  code: number;
  status: string;
  headers: Record<string, string>;
  body: string;
  json(): unknown;
  text(): string;
  responseTime: number;
}

interface FishmanExpectation {
  to: FishmanExpectation;
  be: FishmanExpectation;
  have: FishmanExpectation;
  equal(expected: unknown): void;
  eql(expected: unknown): void;
  oneOf(values: unknown[]): void;
  below(limit: number): void;
  above(limit: number): void;
  a(type: string): void;
  json: { schema(schema: unknown): void };
  true: void;
  false: void;
  null: void;
  undefined: void;
  empty: void;
}

interface FishmanResponseExpectation {
  to: FishmanResponseExpectation;
  be: FishmanResponseExpectation;
  have: FishmanResponseExpectation;
  status(code: number): void;
  header(name: string, value?: string): void;
  jsonBody(path: string, expected?: unknown): void;
  responseTimeBelow(ms: number): void;
  json: boolean;
  success: boolean;
}

/** Primary Fishman script API (short alias) — type `fm.` for suggestions */
declare const fm: FishmanScriptApi;
/** Primary Fishman script API */
declare const fishman: FishmanScriptApi;
/** @deprecated Postman compatibility — prefer `fm` or `fishman` */
declare const pm: FishmanScriptApi;
/** @deprecated Bruno compatibility — prefer `fm` or `fishman` */
declare const bru: FishmanBruApi;
declare const res: FishmanResApi | undefined;
