import type { ScanOptions, ScanProgress } from "../models/scan-result";

export type ScanRunOptions = ScanOptions & {
  onProgress?: (progress: ScanProgress) => void;
};
