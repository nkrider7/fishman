import type {
  ScriptExecutionContext,
  ScriptExecutionResult,
  ScriptLogEntry,
  SendRequestResult,
  SendRequestSpec,
} from "../types";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./worker";

export class SandboxWorkerClient {
  private worker: Worker | null = null;
  private activeExecutions = new Map<
    string,
    {
      resolve: (result: ScriptExecutionResult) => void;
      reject: (error: Error) => void;
      onLog?: (entry: ScriptLogEntry) => void;
      onSendRequest?: (spec: SendRequestSpec) => Promise<SendRequestResult>;
    }
  >();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        void this.handleMessage(event.data);
      };
    }
    return this.worker;
  }

  private async handleMessage(message: WorkerOutboundMessage): Promise<void> {
    if (message.type === "log") {
      const execution = this.activeExecutions.get(message.executionId);
      execution?.onLog?.({
        ...message.entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type === "sendRequest") {
      const execution = this.activeExecutions.get(message.executionId);
      if (!execution?.onSendRequest) {
        this.postMessage({
          type: "sendRequestResult",
          id: message.requestId,
          executionId: message.executionId,
          error: "sendRequest is not available in this context",
        });
        return;
      }

      try {
        const result = await execution.onSendRequest(message.spec);
        this.postMessage({
          type: "sendRequestResult",
          id: message.requestId,
          executionId: message.executionId,
          result,
        });
      } catch (error) {
        this.postMessage({
          type: "sendRequestResult",
          id: message.requestId,
          executionId: message.executionId,
          error: error instanceof Error ? error.message : "sendRequest failed",
        });
      }
      return;
    }

    if (message.type === "complete") {
      const execution = this.activeExecutions.get(message.executionId);
      if (execution) {
        this.activeExecutions.delete(message.executionId);
        execution.resolve(message.result);
      }
      return;
    }

    if (message.type === "error") {
      const execution = this.activeExecutions.get(message.executionId);
      if (execution) {
        this.activeExecutions.delete(message.executionId);
        execution.reject(new Error(message.error.message));
      }
    }
  }

  private postMessage(message: WorkerInboundMessage): void {
    this.ensureWorker().postMessage(message);
  }

  execute(
    script: string,
    context: ScriptExecutionContext,
    options?: {
      onLog?: (entry: ScriptLogEntry) => void;
      onSendRequest?: (spec: SendRequestSpec) => Promise<SendRequestResult>;
      signal?: AbortSignal;
    },
  ): Promise<ScriptExecutionResult> {
    if (!script.trim()) {
      return Promise.resolve({
        success: true,
        durationMs: 0,
        logs: [],
        tests: [],
        variableChanges: [],
        aborted: false,
      });
    }

    const executionId = crypto.randomUUID();

    return new Promise<ScriptExecutionResult>((resolve, reject) => {
      this.activeExecutions.set(executionId, {
        resolve,
        reject,
        onLog: options?.onLog,
        onSendRequest: options?.onSendRequest,
      });

      const onAbort = () => {
        this.cancel(executionId);
        reject(new Error("Script execution cancelled"));
      };

      options?.signal?.addEventListener("abort", onAbort, { once: true });

      this.postMessage({
        type: "execute",
        id: executionId,
        script,
        context,
      });
    });
  }

  cancel(executionId: string): void {
    this.postMessage({ type: "cancel", id: executionId });
    this.activeExecutions.delete(executionId);
  }

  dispose(): void {
    this.activeExecutions.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

let sharedClient: SandboxWorkerClient | null = null;

export function getSandboxClient(): SandboxWorkerClient {
  if (!sharedClient) {
    sharedClient = new SandboxWorkerClient();
  }
  return sharedClient;
}
