import { FileNode, Limits } from "./model";
import { ImportError } from "./github-transport";
import { loadText } from "./inventory";
export type GitHubApi = <T>(suffix: string, cap?: number) => Promise<T>;
export async function loadPreview(
  file: FileNode,
  sha: string,
  api: GitHubApi,
  limits: Limits,
  remaining: number,
  consume: (bytes: number) => void,
) {
  const blob = await api<{ encoding: string; content: string }>(
    `/git/blobs/${sha}`,
    Math.ceil(Math.min(limits.perFile, remaining) * 1.5) + 4096,
  );
  if (blob.encoding !== "base64" || typeof blob.content !== "string")
    throw new ImportError("Unsupported GitHub blob encoding.", 502);
  const buffer = Buffer.from(blob.content, "base64");
  consume(buffer.byteLength);
  delete file.failure;
  delete file.contentReason;
  if (buffer.byteLength > limits.perFile || buffer.byteLength > remaining) {
    file.contentStatus = "too-large";
    file.contentReason =
      "Downloaded bytes exceeded the content budget; content discarded.";
    return;
  }
  if (buffer.includes(0)) {
    file.contentStatus = "binary";
    file.contentReason = "Binary content detected in a preview-eligible file.";
    return;
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    file.contentStatus = "binary";
    file.contentReason = "Non-UTF-8 content; text preview unavailable.";
    return;
  }
  loadText(file, source, buffer.byteLength);
}
