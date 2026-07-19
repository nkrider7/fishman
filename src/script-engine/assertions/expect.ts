import type { ScriptResponseState } from "../types";

export interface AssertionResult {
  passed: boolean;
  message: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class Expectation {
  constructor(private readonly actual: unknown) {}

  get to() {
    return this;
  }

  get be() {
    return this;
  }

  get have() {
    return this;
  }

  equal(expected: unknown): void {
    if (this.actual !== expected) {
      throw new Error(
        `Expected ${formatValue(expected)} but got ${formatValue(this.actual)}`,
      );
    }
  }

  eql(expected: unknown): void {
    const actualJson = JSON.stringify(this.actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(
        `Expected ${expectedJson} but got ${actualJson}`,
      );
    }
  }

  oneOf(values: unknown[]): void {
    if (!values.some((v) => v === this.actual)) {
      throw new Error(
        `Expected one of ${formatValue(values)} but got ${formatValue(this.actual)}`,
      );
    }
  }

  below(limit: number): void {
    if (typeof this.actual !== "number" || this.actual >= limit) {
      throw new Error(`Expected ${formatValue(this.actual)} to be below ${limit}`);
    }
  }

  above(limit: number): void {
    if (typeof this.actual !== "number" || this.actual <= limit) {
      throw new Error(`Expected ${formatValue(this.actual)} to be above ${limit}`);
    }
  }

  a(type: string): void {
    if (type === "string" && typeof this.actual !== "string") {
      throw new Error(`Expected a string but got ${typeof this.actual}`);
    }
    if (type === "number" && typeof this.actual !== "number") {
      throw new Error(`Expected a number but got ${typeof this.actual}`);
    }
    if (type === "boolean" && typeof this.actual !== "boolean") {
      throw new Error(`Expected a boolean but got ${typeof this.actual}`);
    }
    if (type === "object" && (typeof this.actual !== "object" || this.actual === null)) {
      throw new Error(`Expected an object but got ${typeof this.actual}`);
    }
  }

  get json() {
    return {
      schema: (_schema: unknown) => {
        if (typeof this.actual !== "object" || this.actual === null) {
          throw new Error("Expected JSON object");
        }
      },
    };
  }

  get ["true"](): void {
    if (this.actual !== true) {
      throw new Error(`Expected true but got ${formatValue(this.actual)}`);
    }
    return;
  }

  get ["false"](): void {
    if (this.actual !== false) {
      throw new Error(`Expected false but got ${formatValue(this.actual)}`);
    }
    return;
  }

  get ["null"](): void {
    if (this.actual !== null) {
      throw new Error(`Expected null but got ${formatValue(this.actual)}`);
    }
    return;
  }

  get ["undefined"](): void {
    if (this.actual !== undefined) {
      throw new Error(`Expected undefined but got ${formatValue(this.actual)}`);
    }
    return;
  }

  get empty(): void {
    if (
      this.actual === null ||
      this.actual === undefined ||
      (typeof this.actual === "string" && this.actual.length === 0) ||
      (Array.isArray(this.actual) && this.actual.length === 0)
    ) {
      return;
    }
    throw new Error(`Expected empty value but got ${formatValue(this.actual)}`);
  }
}

export class ResponseExpectation {
  constructor(private readonly response: ScriptResponseState) {}

  get to() {
    return this;
  }

  get be() {
    return this;
  }

  get have() {
    return this;
  }

  status(code: number): void {
    if (this.response.status !== code) {
      throw new Error(
        `Expected status ${code} but got ${this.response.status}`,
      );
    }
  }

  header(name: string, value?: string): void {
    const key = Object.keys(this.response.headers).find(
      (h) => h.toLowerCase() === name.toLowerCase(),
    );
    if (!key) {
      throw new Error(`Expected header "${name}" to exist`);
    }
    if (value !== undefined && this.response.headers[key] !== value) {
      throw new Error(
        `Expected header "${name}" to be "${value}" but got "${this.response.headers[key]}"`,
      );
    }
  }

  jsonBody(path: string, expected?: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.response.body);
    } catch {
      throw new Error("Response body is not valid JSON");
    }

    if (expected === undefined) return;

    const segments = path.split(".").filter(Boolean);
    let current: unknown = parsed;
    for (const segment of segments) {
      if (current === null || typeof current !== "object") {
        throw new Error(`Path "${path}" not found in response JSON`);
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${path} to be ${formatValue(expected)} but got ${formatValue(current)}`,
      );
    }
  }

  responseTimeBelow(ms: number): void {
    if (this.response.time >= ms) {
      throw new Error(
        `Expected response time below ${ms}ms but got ${this.response.time}ms`,
      );
    }
  }

  get json() {
    try {
      JSON.parse(this.response.body);
    } catch {
      throw new Error("Response is not valid JSON");
    }
    return true;
  }

  get success() {
    if (this.response.status < 200 || this.response.status >= 300) {
      throw new Error(`Expected success status but got ${this.response.status}`);
    }
    return true;
  }
}

export function createExpect(actual: unknown): Expectation {
  return new Expectation(actual);
}

export function createResponseExpect(
  response: ScriptResponseState,
): ResponseExpectation {
  return new ResponseExpectation(response);
}
