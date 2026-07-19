import type { ScriptError, ScriptPipelineResult } from "../types";

export type ScriptErrorPhase = "Pre-request" | "Post-response" | "Tests";

export interface TabScriptError {
  phase: ScriptErrorPhase;
  error: ScriptError;
}

export function getScriptErrorFromPipeline(
  result?: Pick<ScriptPipelineResult, "preRequest" | "postResponse" | "tests">,
): TabScriptError | null {
  if (result?.preRequest?.error) {
    return { phase: "Pre-request", error: result.preRequest.error };
  }
  if (result?.postResponse?.error) {
    return { phase: "Post-response", error: result.postResponse.error };
  }
  if (result?.tests?.error) {
    return { phase: "Tests", error: result.tests.error };
  }
  return null;
}

export function hasScriptError(
  result?: Pick<ScriptPipelineResult, "preRequest" | "postResponse" | "tests">,
): boolean {
  return getScriptErrorFromPipeline(result) !== null;
}

/** True only when a script stage actually executed (not an empty pipeline shell). */
export function hasScriptsExecuted(
  result?: Pick<
    ScriptPipelineResult,
    "timeline" | "preRequest" | "postResponse" | "tests"
  > | null,
  extras?: { logCount?: number; testCount?: number },
): boolean {
  if (!result) {
    return (extras?.logCount ?? 0) > 0 || (extras?.testCount ?? 0) > 0;
  }
  return (
    result.timeline.length > 0 ||
    !!result.preRequest ||
    !!result.postResponse ||
    !!result.tests ||
    (extras?.logCount ?? 0) > 0 ||
    (extras?.testCount ?? 0) > 0
  );
}
