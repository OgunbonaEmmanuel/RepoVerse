import { createHash } from "node:crypto";
import { explanationLanguage } from "./explanation";
import { sourceLines } from "./source-lines";
export class ExplanationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const SOURCE_BYTE_LIMIT = 24 * 1024;
export const SOURCE_LINE_LIMIT = 800;
export const PROMPT_VERSION = "file-explanation-v3-evidence";
export interface PreparedExplanation {
  repository: string;
  commit: string;
  path: string;
  blobSha: string;
  sourceHash: string;
  language: string;
  source: string;
  totalLines: number;
  suppliedLines: number;
  truncated: boolean;
  dependencies: {
    specifier: string;
    kind: string;
    to?: string;
    line: number;
    reason?: string;
  }[];
  dependenciesTruncated: boolean;
  analysisStatus: string;
}
export function prepareExplanation(input: unknown): PreparedExplanation {
  const data = input as Record<string, unknown> | null;
  if (!data || data.consent !== true)
    throw new ExplanationError(
      "Confirm that the selected source may be sent to OpenAI.",
    );
  const short = (v: unknown, max: number): v is string =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= max &&
    !/[\u0000-\u001f]/.test(v);
  if (
    !short(data.repository, 300) ||
    !short(data.commit, 100) ||
    !short(data.path, 500)
  )
    throw new ExplanationError("Invalid repository, commit or file path.");
  const language = explanationLanguage(data.path);
  if (!language)
    throw new ExplanationError(
      "This file type or potentially sensitive path is ineligible for AI explanation.",
    );
  if (
    typeof data.source !== "string" ||
    !data.source.trim() ||
    data.source.includes("\0") ||
    Buffer.byteLength(data.source) > 512 * 1024
  )
    throw new ExplanationError(
      "Loaded UTF-8 source of at most 512 KiB is required.",
    );
  const bytes = Buffer.byteLength(data.source);
  const sourceHash = createHash("sha256").update(data.source).digest("hex");
  if (
    data.blobSha !== undefined &&
    (typeof data.blobSha !== "string" || !/^[a-f0-9]{40}$/.test(data.blobSha))
  )
    throw new ExplanationError("Invalid snapshot blob identity.");
  const blobSha =
    (data.blobSha as string | undefined) ??
    createHash("sha1")
      .update(`blob ${bytes}\0`)
      .update(data.source)
      .digest("hex");
  const lines = sourceLines(data.source);
  let used = 0;
  const included: string[] = [];
  for (const line of lines) {
    const size = Buffer.byteLength(line) + (included.length ? 1 : 0);
    if (included.length >= SOURCE_LINE_LIMIT || used + size > SOURCE_BYTE_LIMIT)
      break;
    used += size;
    included.push(line);
  }
  if (!included.length)
    throw new ExplanationError(
      "The first source line exceeds the AI input limit; this file cannot be explained.",
      413,
    );
  if (!Array.isArray(data.dependencies) || data.dependencies.length > 20000)
    throw new ExplanationError("Invalid direct dependency metadata.");
  const dependencies: PreparedExplanation["dependencies"] = [];
  let metadataBytes = 0;
  for (const edge of data.dependencies) {
    if (
      !edge ||
      !short(edge.specifier, 500) ||
      !["internal", "external", "unresolved"].includes(edge.kind) ||
      !Number.isInteger(edge.line) ||
      edge.line < 1 ||
      edge.line > lines.length ||
      (edge.to !== undefined && !short(edge.to, 500)) ||
      (edge.reason !== undefined && !short(edge.reason, 500))
    )
      throw new ExplanationError("Invalid direct dependency metadata.");
    const clean = {
      specifier: edge.specifier,
      kind: edge.kind,
      line: edge.line,
      ...(edge.to ? { to: edge.to } : {}),
      ...(edge.reason ? { reason: edge.reason } : {}),
    };
    metadataBytes += Buffer.byteLength(JSON.stringify(clean));
    if (dependencies.length < 80 && metadataBytes <= 8192)
      dependencies.push(clean);
  }
  return {
    repository: data.repository,
    commit: data.commit,
    path: data.path,
    blobSha,
    sourceHash,
    language,
    source: included.join("\n"),
    totalLines: lines.length,
    suppliedLines: included.length,
    truncated: included.length < lines.length,
    dependencies,
    dependenciesTruncated: dependencies.length < data.dependencies.length,
    analysisStatus: data.analysisStatus === "parsed" ? "parsed" : "incomplete",
  };
}
