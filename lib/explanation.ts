import type { FileNode } from "./model";
import { supportsDependencies } from "./file-types";
import { sourceLines } from "./source-lines";
export const EXPLANATION_SECTIONS = {
  purpose: "Main purpose",
  symbols: "Functions, classes and exports",
  imports: "Use of direct imports",
  limitations: "What cannot be established",
} as const;
export type SectionName = keyof typeof EXPLANATION_SECTIONS;
const sectionLimits: Record<SectionName, number> = {
  purpose: 1,
  symbols: 4,
  imports: 8,
  limitations: 2,
};
export interface SourceReference {
  start: number;
  end: number;
  excerpt: string;
  verification?: "matched" | "out-of-range" | "excerpt-mismatch";
}
export interface ExplanationItem {
  text: string;
  references: SourceReference[];
}
export type Explanation = Record<SectionName, ExplanationItem[]>;
export interface ExplanationResult {
  explanation: Explanation;
  model: string;
  promptVersion: string;
  repository: string;
  commit: string;
  path: string;
  blobSha: string;
  suppliedLines: number;
  totalLines: number;
  truncated: boolean;
  dependenciesTruncated: boolean;
}
export function explanationLanguage(path: string): string | null {
  if (
    !supportsDependencies(path) ||
    path.length > 500 ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p.startsWith(".") ||
          /^(?:config|configuration|credentials|secrets?|settings)(?:[._-]|$)/i.test(
            p,
          ),
      ) ||
    /(?:^|[./_-])(?:env|config|credentials|secrets?|settings)(?:[./_-]|$)/i.test(
      path,
    )
  )
    return null;
  return /\.(?:tsx?|mts|cts)$/i.test(path) ? "TypeScript" : "JavaScript";
}
export function explanationUnavailable(file: FileNode): string | null {
  if (!explanationLanguage(file.id))
    return "AI explanations support JS/TS source files. Configuration and potentially sensitive paths are excluded.";
  if (file.contentStatus === "binary" || file.contentStatus === "lfs")
    return "AI explanations are unavailable for binary files and LFS pointers.";
  if (file.source === null || file.contentStatus !== "loaded")
    return "Load this file’s contents before requesting an explanation.";
  if (!file.source.trim())
    return "This file is empty; there is no source to explain.";
  return null;
}
const referenceSchema = {
  type: "object",
  properties: {
    start: { type: "integer" },
    end: { type: "integer" },
    excerpt: { type: "string", maxLength: 1200 },
  },
  required: ["start", "end", "excerpt"],
  additionalProperties: false,
};
export const explanationSchema = {
  type: "object",
  properties: Object.fromEntries(
    Object.keys(EXPLANATION_SECTIONS).map((key) => [
      key,
      {
        type: "array",
        minItems: key === "purpose" ? 1 : 0,
        maxItems: sectionLimits[key as SectionName],
        items: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 600 },
            references: {
              type: "array",
              minItems: key === "limitations" ? 0 : 1,
              maxItems: 5,
              items: referenceSchema,
            },
          },
          required: ["text", "references"],
          additionalProperties: false,
        },
      },
    ]),
  ),
  required: Object.keys(EXPLANATION_SECTIONS),
  additionalProperties: false,
};
/** Validate even structured output: schema compliance is not proof of grounded citations. */
export function validateExplanation(
  value: unknown,
  source: string,
  suppliedLines = sourceLines(source).length,
): Explanation {
  const lines = sourceLines(source).slice(0, suppliedLines);
  const invalid = () => {
    throw new Error("Invalid explanation");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  // Copy before adding derived status; never trust status from the provider or server.
  const data = structuredClone(value) as Record<string, unknown>;
  const keys = Object.keys(EXPLANATION_SECTIONS) as SectionName[];
  if (Object.keys(data).length !== keys.length) return invalid();
  let textLength = 0;
  for (const key of keys) {
    const section = data[key];
    if (
      !Array.isArray(section) ||
      section.length > sectionLimits[key] ||
      (key === "purpose" && !section.length)
    )
      return invalid();
    for (const item of section) {
      if (
        !item ||
        Object.keys(item).sort().join(",") !== "references,text" ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        item.text.length > 600 ||
        !Array.isArray(item.references) ||
        item.references.length > 5 ||
        (key !== "limitations" && !item.references.length)
      )
        return invalid();
      textLength += item.text.length;
      for (const ref of item.references) {
        if (
          !ref ||
          !["end,excerpt,start", "end,excerpt,start,verification"].includes(
            Object.keys(ref).sort().join(","),
          ) ||
          !Number.isInteger(ref.start) ||
          !Number.isInteger(ref.end) ||
          typeof ref.excerpt !== "string" ||
          ref.excerpt.length > 1200
        )
          return invalid();
        if (ref.start < 1 || ref.end < ref.start || ref.end > lines.length) {
          ref.verification = "out-of-range";
        } else {
          const excerptLines = sourceLines(ref.excerpt);
          const range = lines.slice(ref.start - 1, ref.end).join("\n");
          // Match only the claimed range, never relocate repeated text elsewhere.
          // The quote must span every cited line; columns may start/end within a line.
          ref.verification =
            ref.excerpt.trim() &&
            excerptLines.length === ref.end - ref.start + 1 &&
            range.includes(excerptLines.join("\n"))
              ? "matched"
              : "excerpt-mismatch";
        }
      }
    }
  }
  if (textLength > 4500) return invalid();
  return data as Explanation;
}
