import { FileNode, ImportRecord } from "./model";

/** Presentation only: incoming edges remain useful even for unsupported/unloaded targets. */
export function dependencyMessage(
  file: FileNode,
  mode: "outgoing" | "incoming",
  imports: ImportRecord[],
): string | null {
  if (mode === "incoming") {
    return imports.some((e) => e.kind === "internal" && e.to === file.id)
      ? null
      : "No incoming imports found among analysed files.";
  }
  if (file.status === "unsupported")
    return "Dependency analysis is not supported for this file type.";
  if (file.status === "syntax errors")
    return "Dependency analysis is incomplete because this file contains syntax errors. Any imports shown may be incomplete.";
  if (
    file.status === "not analysed" ||
    file.source === null ||
    file.contentStatus !== "loaded"
  ) {
    if (file.contentStatus === "error" && file.contentReason)
      return `Dependency analysis has not run: ${file.contentReason}`;
    const reason = {
      loaded: "analysis has not run",
      "not-loaded": "contents have not been loaded",
      "too-large": "the file exceeds the preview size limit",
      "download-limit": "the content download budget was reached",
      error: "the content download failed or was interrupted",
      binary: "contents could not be read as UTF-8 text",
      lfs: "only a Git LFS pointer is available; the asset has not been downloaded",
    }[file.contentStatus];
    return `Dependency analysis has not run: ${reason}.`;
  }
  const outgoing = imports.filter((e) => e.from === file.id);
  if (!outgoing.length) return "No imports found.";
  if (!outgoing.some((e) => e.kind === "internal"))
    return "Imports were detected, but none resolved to files in this repository. See external and unresolved imports below.";
  return null;
}
