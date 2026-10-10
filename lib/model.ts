import type { FileCategory } from "./file-types";
export type ContentStatus =
  | "loaded"
  | "not-loaded"
  | "binary"
  | "too-large"
  | "download-limit"
  | "error"
  | "lfs";
export const contentLabels: Record<ContentStatus, string> = {
  loaded: "Contents loaded",
  "not-loaded": "Contents not loaded",
  binary: "Binary preview unavailable",
  "too-large": "Exceeds preview limit",
  "download-limit": "Contents not loaded — download budget reached",
  error: "Contents not loaded — see download failure below",
  lfs: "Git LFS pointer — asset not downloaded",
};
export interface FileNode {
  id: string;
  source: string | null;
  bytes: number | null;
  lines: number | null;
  category: FileCategory;
  contentStatus: ContentStatus;
  contentReason?: string;
  failure?: DownloadFailure;
  retriesRemaining?: number;
  githubUrl?: string;
  lfs?: { pointerBytes: number; assetBytes: number; oid: string };
  status: "parsed" | "unsupported" | "syntax errors" | "not analysed";
}
export interface ImportRecord {
  from: string;
  specifier: string;
  line: number;
  kind: "internal" | "external" | "unresolved";
  to?: string;
  reason?: string;
}
export interface Exclusion {
  path: string;
  reason: string;
}
export interface Graph {
  name: string;
  commit: string;
  demo: boolean;
  files: FileNode[];
  imports: ImportRecord[];
  exclusions: Exclusion[];
  partial: boolean;
  inventoryIncomplete: boolean;
  warnings: string[];
  recoveryId?: string;
}
export interface DownloadFailure {
  kind:
    | "rate-limit"
    | "timeout"
    | "cancelled"
    | "network"
    | "http"
    | "invalid-response"
    | "size-limit";
  message: string;
  httpStatus?: number;
  requestId?: string;
  retryAt?: number;
  attempts: number;
  attempted: boolean;
  blockedBy?: string;
}
export interface FileRecovery {
  recoveryId: string;
  commit: string;
  file: FileNode;
  imports: ImportRecord[];
  warnings: string[];
}
export interface SourceInput {
  path: string;
  source: string;
}
export interface Limits {
  files: number;
  perFile: number;
  total: number;
}
export const LIMITS: Limits = {
  files: 2000,
  perFile: 512 * 1024,
  total: 20 * 1024 * 1024,
};
export function connected(
  graph: Graph,
  id: string,
  mode: "outgoing" | "incoming",
) {
  return graph.imports.filter(
    (e) =>
      e.kind === "internal" &&
      (mode === "outgoing" ? e.from === id : e.to === id),
  );
}
