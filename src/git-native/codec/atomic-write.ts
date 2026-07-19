import type { GitNativeFs } from "../fs";
import { serializeJson } from "./json";

/**
 * Crash-safe write: temp → replace.
 * Memory FS / simple adapters fall back to direct write.
 */
export async function atomicWriteFile(
  fs: GitNativeFs,
  absolutePath: string,
  contents: string,
): Promise<void> {
  const dir = fs.dirname(absolutePath);
  if (dir) {
    await fs.mkdir(dir, { recursive: true });
  }

  const tempPath = `${absolutePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, contents);

  try {
    if (await fs.exists(absolutePath)) {
      await fs.remove(absolutePath);
    }
  } catch {
    // ignore
  }

  try {
    await fs.rename(tempPath, absolutePath);
  } catch {
    await fs.writeFile(absolutePath, contents);
    try {
      await fs.remove(tempPath);
    } catch {
      // ignore
    }
  }
}

export async function atomicWriteJson(
  fs: GitNativeFs,
  absolutePath: string,
  value: unknown,
): Promise<void> {
  await atomicWriteFile(fs, absolutePath, serializeJson(value));
}
