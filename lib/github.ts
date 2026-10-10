import { analyzeFiles } from "./analyze";
import { DownloadFailure, Exclusion, FileNode, LIMITS, Limits } from "./model";
import { exclusionReason } from "./policy";
import { inventoryFile, wantsPreview } from "./inventory";
import { ImportError, parseRepository } from "./github-transport";
import { createGitHubClient, ClientOptions } from "./github-client";
import { loadPreview } from "./load-preview";
import { registerRecovery } from "./file-recovery";
export { ImportError, boundedBytes, parseRepository } from "./github-transport";
interface Repository {
  private: boolean;
  default_branch: string;
}
interface Commit {
  sha: string;
  commit: { tree: { sha: string } };
}
interface TreeEntry {
  path: string;
  type: string;
  mode: string;
  sha: string;
  size?: number;
}
interface TreeResponse {
  truncated: boolean;
  tree: TreeEntry[];
}
interface Options extends ClientOptions {
  limits?: Limits;
}
export async function importGitHub(input: unknown, options: Options = {}) {
  const { owner, repo } = parseRepository(input);
  const limits = options.limits ?? LIMITS;
  const overall = AbortSignal.timeout(90_000);
  const signal = options.signal
    ? AbortSignal.any([overall, options.signal])
    : overall;
  const api = createGitHubClient(owner, repo, {
    ...options,
    signal,
    maxAttempts: 1,
  });
  const repository = await api<Repository>("");
  if (repository.private)
    throw new ImportError("Private repositories are unsupported.", 403);
  if (typeof repository.default_branch !== "string")
    throw new ImportError("GitHub returned invalid repository metadata.", 502);
  const commit = await api<Commit>(
    `/commits/${encodeURIComponent(repository.default_branch)}`,
  );
  const shaPattern = /^[a-f0-9]{40}$/;
  if (
    !shaPattern.test(commit.sha) ||
    !shaPattern.test(commit.commit?.tree?.sha ?? "")
  )
    throw new ImportError("GitHub returned an invalid commit snapshot.", 502);
  const tree = await api<TreeResponse>(
    `/git/trees/${commit.commit.tree.sha}?recursive=1`,
  );
  if (!Array.isArray(tree.tree) || tree.tree.length > 100_000)
    throw new ImportError("Repository tree exceeds the metadata limit.", 413);
  const exclusions: Exclusion[] = [];
  const files: FileNode[] = [];
  const blobs = new Map<string, string>();
  const warnings: string[] = [];
  let total = 0;
  let inventoryIncomplete = tree.truncated === true;
  if (inventoryIncomplete)
    warnings.push(
      "Inventory incomplete: GitHub truncated its recursive tree; missing paths and their count are unknown.",
    );
  const candidates = tree.tree
    .filter((e) => e.type !== "tree")
    .sort((a, b) => a.path.localeCompare(b.path));
  for (let index = 0; index < candidates.length; index++) {
    const entry = candidates[index];
    const reason =
      exclusionReason(entry.path) ??
      (entry.type !== "blob" || entry.mode === "120000"
        ? "symlink or submodule"
        : !shaPattern.test(entry.sha) ||
            (entry.size !== undefined &&
              (!Number.isSafeInteger(entry.size) || entry.size < 0))
          ? "invalid blob metadata"
          : files.length >= limits.files
            ? "inventory file-count limit"
            : undefined);
    if (reason) {
      exclusions.push({ path: entry.path, reason });
      if (reason.includes("limit") || reason === "invalid blob metadata")
        inventoryIncomplete = true;
      continue;
    }
    const file = inventoryFile(entry.path, entry.size ?? null, limits);
    file.blobSha = entry.sha;
    file.githubUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${commit.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    files.push(file);
    blobs.set(file.id, entry.sha);
  }

  // Inventory survives content errors; record which request actually failed.
  let stopped: { path: string; failure: DownloadFailure } | undefined;
  for (const file of files) {
    if (!wantsPreview(file, limits)) continue;
    if (stopped) {
      file.contentStatus = "error";
      file.failure = {
        ...stopped.failure,
        attempted: false,
        attempts: 0,
        blockedBy: stopped.path,
      };
      file.contentReason = `Not requested: fetching stopped after ${stopped.path}. ${stopped.failure.message}`;
      continue;
    }
    if (total + file.bytes! > limits.total) {
      file.contentStatus = "download-limit";
      continue;
    }
    try {
      await loadPreview(
        file,
        blobs.get(file.id)!,
        api,
        limits,
        limits.total - total,
        (bytes) => {
          total += bytes;
        },
      );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const failure =
        error instanceof ImportError && error.failure
          ? error.failure
          : {
              kind: "invalid-response" as const,
              message:
                error instanceof Error
                  ? error.message
                  : "Source fetching failed.",
              attempts: 1,
              attempted: true,
            };
      file.contentStatus = "error";
      file.failure = failure;
      file.contentReason = failure.message;
      stopped = { path: file.id, failure };
      warnings.push(`Initial import stopped at ${file.id}: ${failure.message}`);
    }
  }
  const graph = analyzeFiles(files, {
    name: `${owner}/${repo}`,
    commit: commit.sha,
    demo: false,
  });
  graph.exclusions.push(...exclusions);
  graph.inventoryIncomplete = inventoryIncomplete;
  graph.partial ||= inventoryIncomplete;
  graph.warnings.push(...warnings);
  registerRecovery(graph, owner, repo, blobs, total, limits);
  return graph;
}
