/**
 * Global serial queue for Tauri plugin-fs IPC.
 * Parallel FS storms (isomorphic-git statusMatrix + export writes) have
 * correlated with Linux WebKitGTK heap corruption:
 * `malloc(): unaligned tcache chunk detected`.
 */
let queue: Promise<unknown> = Promise.resolve();

export function enqueueTauriFs<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
