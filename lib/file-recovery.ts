import { randomUUID } from "node:crypto";
import { analyzeFiles } from "./analyze";
import { createGitHubClient, ClientOptions } from "./github-client";
import { ImportError } from "./github-transport";
import { supportsDependencies } from "./file-types";
import { wantsPreview } from "./inventory";
import { loadPreview } from "./load-preview";
import { FileNode, FileRecovery, Graph, Limits } from "./model";
interface Entry {
  file: FileNode;
  sha: string;
  actions: number;
  result?: FileRecovery;
}
interface Session {
  owner: string;
  repo: string;
  commit: string;
  paths: Set<string>;
  files: Map<string, Entry>;
  limits: Limits;
  consumed: number;
  expires: number;
  busy: boolean;
}
const runtime = globalThis as typeof globalThis & {
  repoVerseRecovery?: Map<string, Session>;
};
const sessions = (runtime.repoVerseRecovery ??= new Map<string, Session>());
export const MAX_RECOVERY_ACTIONS = 3;
export function registerRecovery(
  graph: Graph,
  owner: string,
  repo: string,
  blobs: Map<string, string>,
  consumed: number,
  limits: Limits,
) {
  const files = new Map<string, Entry>();
  for (const file of graph.files)
    if (
      file.contentStatus === "error" &&
      supportsDependencies(file.id) &&
      wantsPreview(file, limits)
    ) {
      file.retriesRemaining = MAX_RECOVERY_ACTIONS;
      files.set(file.id, {
        file: { ...file },
        sha: blobs.get(file.id)!,
        actions: 0,
      });
    }
  if (!files.size) return;
  for (const [id, session] of sessions)
    if (session.expires < Date.now()) sessions.delete(id);
  while (sessions.size >= 8) sessions.delete(sessions.keys().next().value!);
  const id = randomUUID();
  sessions.set(id, {
    owner,
    repo,
    commit: graph.commit,
    paths: new Set(graph.files.map((f) => f.id)),
    files,
    limits: { ...limits },
    consumed,
    expires: Date.now() + 3600_000,
    busy: false,
  });
  graph.recoveryId = id;
}
export async function retrySourceFile(
  input: unknown,
  options: ClientOptions = {},
): Promise<FileRecovery> {
  const data = input as {
    recoveryId?: unknown;
    commit?: unknown;
    path?: unknown;
  } | null;
  if (
    !data ||
    typeof data.recoveryId !== "string" ||
    typeof data.commit !== "string" ||
    typeof data.path !== "string"
  )
    throw new ImportError(
      "Retry requires a snapshot ID, commit and file path.",
    );
  const session = sessions.get(data.recoveryId);
  if (!session || session.expires < Date.now())
    throw new ImportError(
      "The file-retry snapshot expired or the server restarted. Import the repository again to create a new snapshot.",
      410,
    );
  if (data.commit !== session.commit)
    throw new ImportError(
      "Retry commit does not match the imported snapshot.",
      409,
    );
  const entry = session.files.get(data.path);
  if (!entry)
    throw new ImportError(
      "Only failed, preview-eligible JS/TS files in this snapshot can be retried.",
      400,
    );
  if (entry.result) return entry.result;
  if (session.busy)
    throw new ImportError(
      "Another file retry is running for this snapshot.",
      409,
    );
  if (entry.actions >= MAX_RECOVERY_ACTIONS)
    throw Object.assign(
      new ImportError("This file reached its three-action retry limit.", 429),
      { retriesRemaining: 0 },
    );
  if ((entry.file.failure?.retryAt ?? 0) > (options.now ?? Date.now)())
    throw new ImportError(
      "GitHub requested a cooldown; retry after the displayed time.",
      429,
      entry.file.failure,
    );
  const remaining = session.limits.total - session.consumed;
  if (entry.file.bytes! > remaining)
    throw new ImportError(
      "The snapshot's remaining content-download budget is too small for this file.",
      413,
      {
        kind: "size-limit",
        message: "The snapshot's content-download budget has been reached.",
        attempts: 0,
        attempted: false,
      },
    );
  session.busy = true;
  entry.actions++;
  const file = {
    ...entry.file,
    retriesRemaining: MAX_RECOVERY_ACTIONS - entry.actions,
  };
  const overall = AbortSignal.timeout(25_000);
  const signal = options.signal
    ? AbortSignal.any([overall, options.signal])
    : overall;
  try {
    const api = createGitHubClient(session.owner, session.repo, {
      ...options,
      signal,
      maxAttempts: 2,
    });
    await loadPreview(
      file,
      entry.sha,
      api,
      session.limits,
      remaining,
      (bytes) => {
        session.consumed += bytes;
      },
    );
    const analysis = analyzeFiles(
      [file],
      {
        name: `${session.owner}/${session.repo}`,
        commit: session.commit,
        demo: false,
      },
      session.paths,
    );
    const result = {
      recoveryId: data.recoveryId,
      commit: session.commit,
      file: analysis.files[0],
      imports: analysis.imports,
      warnings: analysis.warnings,
    };
    entry.result = result;
    return result;
  } catch (error) {
    const failure =
      error instanceof ImportError
        ? error
        : new ImportError("File loading failed.", 502);
    if (failure.failure?.attempted === false) {
      entry.actions--;
      file.retriesRemaining = MAX_RECOVERY_ACTIONS - entry.actions;
    }
    entry.file = {
      ...file,
      failure: failure.failure,
      contentReason: failure.message,
    };
    throw Object.assign(failure, { retriesRemaining: file.retriesRemaining });
  } finally {
    session.busy = false;
  }
}
