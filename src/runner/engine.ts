import type { RequestDraft } from "@/types/request";
import type { StoredCookie } from "@/types/cookie";
import type { ApiResponse } from "@/types/response";
import type { CollectionFolder } from "@/types/collection";
import {
  executeOneRequest,
  type RequestExecutorSettings,
} from "@/services/requestExecutor";
import { resolveNextRequestIndex } from "./control-flow";
import {
  capResponse,
  judgeResultStatus,
  type RunnerConfig,
  type RunnerItemResult,
  type RunnerQueueItem,
} from "./types";
import type { IterationRow } from "./data-file";

export interface RunnerExecuteCallbacks {
  onItemStart: (result: RunnerItemResult) => void;
  onItemComplete: (result: RunnerItemResult) => void;
  onCookieIngest: (setCookies: NonNullable<ApiResponse["set_cookies"]>) => Promise<void>;
  onScriptCookies: (
    url: string,
    changes: { name: string; value: string }[],
  ) => Promise<void>;
  getCookies: () => StoredCookie[];
  loadRequest: (requestId: string) => RequestDraft | null;
}

export interface RunnerEngineInput {
  config: RunnerConfig;
  queue: RunnerQueueItem[];
  iterationRows: IterationRow[];
  variables: Record<string, string>;
  folders: CollectionFolder[];
  settings: RequestExecutorSettings;
  signal: AbortSignal;
  callbacks: RunnerExecuteCallbacks;
}

export interface RunnerEngineSummary {
  cancelled: boolean;
  results: RunnerItemResult[];
  variables: Record<string, string>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Run cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runSingleItem(options: {
  item: RunnerQueueItem;
  iteration: number;
  iterationCount: number;
  iterationData: IterationRow;
  variables: Record<string, string>;
  config: RunnerConfig;
  settings: RequestExecutorSettings;
  folders: CollectionFolder[];
  signal: AbortSignal;
  callbacks: RunnerExecuteCallbacks;
  parallel: boolean;
}): Promise<{
  result: RunnerItemResult;
  variables: Record<string, string>;
  nextRequestName?: string | null;
}> {
  const {
    item,
    iteration,
    iterationCount,
    iterationData,
    config,
    settings,
    folders,
    signal,
    callbacks,
    parallel,
  } = options;

  let variables = { ...options.variables };
  const resultId = crypto.randomUUID();
  const pending: RunnerItemResult = {
    id: resultId,
    requestId: item.requestId,
    name: item.name,
    folderPath: item.folderPath,
    method: item.method,
    iteration,
    status: "running",
    tests: [],
    logs: [],
  };
  callbacks.onItemStart(pending);

  const draft = callbacks.loadRequest(item.requestId);
  if (!draft) {
    const failed: RunnerItemResult = {
      ...pending,
      status: "failed",
      errorMessage: "Request not found",
      durationMs: 0,
    };
    callbacks.onItemComplete(failed);
    return { result: failed, variables };
  }

  try {
    const exec = await executeOneRequest({
      request: draft,
      variables,
      cookies: callbacks.getCookies(),
      folders,
      settings,
      requestName: item.name,
      iterationData,
      iteration,
      iterationCount,
      signal,
    });

    variables = exec.variables;

    const cookieChanges = [
      ...(exec.pipeline.preRequest?.cookieChanges ?? []),
      ...(exec.pipeline.postResponse?.cookieChanges ?? []),
      ...(exec.pipeline.tests?.cookieChanges ?? []),
    ];
    if (cookieChanges.length) {
      await callbacks.onScriptCookies(
        exec.resolvedRequest.url || draft.url,
        cookieChanges,
      );
    }

    if (exec.response?.set_cookies?.length) {
      await callbacks.onCookieIngest(exec.response.set_cookies);
    }

    let nextRequestName = exec.nextRequestName;
    if (parallel && nextRequestName) {
      exec.logs.push({
        id: crypto.randomUUID(),
        level: "warn",
        message: `setNextRequest("${nextRequestName}") ignored in parallel mode`,
        timestamp: Date.now(),
        scriptType: "pre-request",
        requestId: item.requestId,
      });
      nextRequestName = null;
    }

    const status = judgeResultStatus({
      skipped: exec.skipped,
      errorMessage: exec.errorMessage,
      httpStatus: exec.response?.status,
      failOnHttpError: config.failOnHttpError,
      tests: exec.tests,
    });

    const completed: RunnerItemResult = {
      ...pending,
      status,
      httpStatus: exec.response?.status,
      durationMs: exec.durationMs,
      errorMessage: exec.errorMessage,
      skipReason: exec.skipReason,
      tests: exec.tests,
      logs: exec.logs,
      responsePreview: capResponse(exec.response, config.saveResponses),
      finalUrl: exec.response?.final_url ?? undefined,
      requestUrl: exec.resolvedRequest.url,
    };
    callbacks.onItemComplete(completed);
    return { result: completed, variables, nextRequestName };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const failed: RunnerItemResult = {
      ...pending,
      status: message === "Run cancelled" ? "skipped" : "failed",
      skipReason: message === "Run cancelled" ? "cancelled" : undefined,
      errorMessage: message,
      durationMs: 0,
      tests: [],
      logs: [],
    };
    callbacks.onItemComplete(failed);
    return { result: failed, variables };
  }
}

async function runSequential(
  input: RunnerEngineInput,
): Promise<RunnerEngineSummary> {
  const { config, queue, iterationRows, settings, folders, signal, callbacks } =
    input;
  let variables = { ...input.variables };
  const results: RunnerItemResult[] = [];
  let cancelled = false;

  outer: for (let iter = 0; iter < iterationRows.length; iter++) {
    const iteration = iter + 1;
    const row = iterationRows[iter];
    let index = 0;

    while (index < queue.length) {
      if (signal.aborted) {
        cancelled = true;
        break outer;
      }

      const item = queue[index];
      const { result, variables: nextVars, nextRequestName } =
        await runSingleItem({
          item,
          iteration,
          iterationCount: iterationRows.length,
          iterationData: row,
          variables,
          config,
          settings,
          folders,
          signal,
          callbacks,
          parallel: false,
        });

      variables = nextVars;
      results.push(result);

      if (config.stopOnFailure && result.status === "failed") {
        break outer;
      }

      if (nextRequestName) {
        const jumpTo = resolveNextRequestIndex(queue, nextRequestName, index);
        if (jumpTo < 0) {
          const failed: RunnerItemResult = {
            id: crypto.randomUUID(),
            requestId: item.requestId,
            name: `setNextRequest(${nextRequestName})`,
            folderPath: item.folderPath,
            method: "—",
            iteration,
            status: "failed",
            errorMessage: `Next request not found: ${nextRequestName}`,
            tests: [],
            logs: [],
            durationMs: 0,
          };
          callbacks.onItemComplete(failed);
          results.push(failed);
          if (config.stopOnFailure) break outer;
          index += 1;
        } else {
          index = jumpTo;
        }
      } else {
        index += 1;
      }

      if (index < queue.length) {
        try {
          await sleep(config.delayMs, signal);
        } catch {
          cancelled = true;
          break outer;
        }
      }
    }
  }

  return { cancelled, results, variables };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      if (signal.aborted) throw new Error("Run cancelled");
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function runParallel(
  input: RunnerEngineInput,
): Promise<RunnerEngineSummary> {
  const { config, queue, iterationRows, settings, folders, signal, callbacks } =
    input;
  const baseVariables = { ...input.variables };
  const results: RunnerItemResult[] = [];
  let cancelled = false;

  try {
    for (let iter = 0; iter < iterationRows.length; iter++) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }
      const iteration = iter + 1;
      const row = iterationRows[iter];

      const batch = await mapPool(
        queue,
        Math.max(1, config.concurrency),
        async (item) => {
          // Isolated vars per parallel task; cookies are shared via callbacks.
          const { result } = await runSingleItem({
            item,
            iteration,
            iterationCount: iterationRows.length,
            iterationData: row,
            variables: { ...baseVariables },
            config,
            settings,
            folders,
            signal,
            callbacks,
            parallel: true,
          });
          return result;
        },
        signal,
      );

      results.push(...batch);

      if (config.stopOnFailure && batch.some((r) => r.status === "failed")) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Run cancelled") {
      cancelled = true;
    } else {
      throw error;
    }
  }

  return { cancelled, results, variables: baseVariables };
}

export async function runCollectionEngine(
  input: RunnerEngineInput,
): Promise<RunnerEngineSummary> {
  if (input.queue.length === 0) {
    return { cancelled: false, results: [], variables: input.variables };
  }
  if (input.config.parallel) {
    return runParallel(input);
  }
  return runSequential(input);
}
