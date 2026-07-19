/**
 * Debounced, coalesced auto-save scheduler for filesystem `.fish` requests.
 * Pure timing/coalesce logic — callers supply the actual write fn.
 */

export type AutoSaveWriteFn = (requestId: string) => Promise<void>;

export interface AutoSaveSchedulerOptions {
  debounceMs?: number;
  write: AutoSaveWriteFn;
  onStatus?: (status: AutoSaveStatus) => void;
}

export type AutoSaveStatus =
  | { kind: "idle" }
  | { kind: "pending"; requestId: string }
  | { kind: "saving"; requestId: string }
  | { kind: "saved"; requestId: string; at: number }
  | { kind: "error"; requestId: string; message: string };

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  generation: number;
}

export class AutoSaveScheduler {
  private readonly debounceMs: number;
  private readonly write: AutoSaveWriteFn;
  private readonly onStatus?: (status: AutoSaveStatus) => void;
  private pending = new Map<string, Pending>();
  private generation = 0;
  private destroyed = false;

  constructor(options: AutoSaveSchedulerOptions) {
    this.debounceMs = options.debounceMs ?? 800;
    this.write = options.write;
    this.onStatus = options.onStatus;
  }

  /** Schedule (or reset) a save for this request id. */
  schedule(requestId: string): void {
    if (this.destroyed || !requestId) return;
    const existing = this.pending.get(requestId);
    if (existing) clearTimeout(existing.timer);

    const generation = ++this.generation;
    this.onStatus?.({ kind: "pending", requestId });

    const timer = setTimeout(() => {
      void this.run(requestId, generation);
    }, this.debounceMs);

    this.pending.set(requestId, { timer, generation });
  }

  /** Flush one request immediately (e.g. Ctrl+S / tab blur). */
  async flush(requestId: string): Promise<void> {
    if (this.destroyed || !requestId) return;
    const existing = this.pending.get(requestId);
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(requestId);
    }
    const generation = ++this.generation;
    await this.run(requestId, generation);
  }

  /** Flush all pending saves. */
  async flushAll(): Promise<void> {
    const ids = [...this.pending.keys()];
    await Promise.all(ids.map((id) => this.flush(id)));
  }

  cancel(requestId?: string): void {
    if (requestId) {
      const p = this.pending.get(requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(requestId);
      }
      return;
    }
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.onStatus?.({ kind: "idle" });
  }

  destroy(): void {
    this.cancel();
    this.destroyed = true;
  }

  /** Pending count — tests / diagnostics. */
  get pendingCount(): number {
    return this.pending.size;
  }

  private async run(requestId: string, generation: number): Promise<void> {
    const current = this.pending.get(requestId);
    // A newer schedule superseded this generation
    if (current && current.generation !== generation) return;
    this.pending.delete(requestId);

    this.onStatus?.({ kind: "saving", requestId });
    try {
      await this.write(requestId);
      // Ignore if a newer schedule appeared while writing
      const newer = this.pending.get(requestId);
      if (newer && newer.generation > generation) return;
      this.onStatus?.({ kind: "saved", requestId, at: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onStatus?.({ kind: "error", requestId, message });
    }
  }
}
