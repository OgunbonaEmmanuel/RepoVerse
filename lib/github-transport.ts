import type { DownloadFailure } from "./model";
export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public failure?: DownloadFailure,
  ) {
    super(message);
  }
}
export function parseRepository(input: unknown) {
  if (typeof input !== "string" || input.length > 300)
    throw new ImportError("Enter https://github.com/owner/repository.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ImportError(
      "Enter a full URL: https://github.com/owner/repository.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ImportError(
      "Only https://github.com/owner/repository URLs are supported, without query or fragment.",
    );
  const parts = url.pathname.replace(/\/$/, "").split("/").slice(1);
  if (parts.length !== 2)
    throw new ImportError(
      "Use the repository root URL. Branch and subtree URLs are unsupported; the default branch is imported.",
    );
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) ||
    repo === "." ||
    repo === ".."
  )
    throw new ImportError("Invalid GitHub owner or repository name.");
  return { owner, repo };
}
export async function boundedBytes(
  response: Response,
  cap: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > cap) {
    await response.body?.cancel();
    throw new ImportError("Response exceeds the byte limit.", 413);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted)
        throw new ImportError("Request body timed out or was cancelled.", 408);
      const { done, value } = await reader.read();
      if (signal?.aborted)
        throw new ImportError("Request body timed out or was cancelled.", 408);
      if (done) break;
      length += value.byteLength;
      if (length > cap) {
        await reader.cancel();
        throw new ImportError("Response exceeds the byte limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
