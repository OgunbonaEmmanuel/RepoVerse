import { createHash } from "node:crypto";
import { ExplanationResult, validateExplanation } from "./explanation";
import {
  ExplanationError,
  prepareExplanation,
  PROMPT_VERSION,
} from "./explanation-input";
import { requestExplanation } from "./explanation-provider";
export const DEFAULT_EXPLANATION_MODEL = "gpt-4.1-mini";
export function createExplanationService(
  provider = requestExplanation,
  now = Date.now,
) {
  const cache = new Map<
    string,
    { expires: number; value: ExplanationResult }
  >();
  const running = new Map<string, Promise<ExplanationResult>>();
  let starts: number[] = [];
  return async (
    input: unknown,
    config: { apiKey?: string; model?: string },
  ): Promise<ExplanationResult> => {
    const data = prepareExplanation(input);
    if (!config.apiKey?.trim())
      throw new ExplanationError(
        "AI explanations are not configured. Set OPENAI_API_KEY in .env.local and restart the server.",
        503,
      );
    const model = config.model?.trim() || DEFAULT_EXPLANATION_MODEL;
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(model))
      throw new ExplanationError(
        "Check OPENAI_MODEL in .env.local and restart the server.",
        503,
      );
    // Key includes every requested identity field plus the exact bounded context to avoid stale metadata.
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          data.repository,
          data.commit,
          data.path,
          data.blobSha,
          model,
          PROMPT_VERSION,
          data,
        ]),
      )
      .digest("hex");
    for (const [id, entry] of cache)
      if (entry.expires <= now()) cache.delete(id);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.value;
    }
    const pending = running.get(key);
    if (pending) return pending;
    starts = starts.filter((time) => time > now() - 60000);
    if (running.size >= 2 || starts.length >= 8)
      throw new ExplanationError(
        "Explanation request limit reached. Wait a minute and retry.",
        429,
      );
    starts.push(now());
    const task = (async () => {
      let output: unknown;
      try {
        output = await provider(data, model, config.apiKey!);
      } catch {
        throw new ExplanationError(
          "The AI provider could not complete the explanation. Check server API settings and quota, then retry.",
          502,
        );
      }
      let explanation;
      try {
        explanation = validateExplanation(output, data.source);
      } catch {
        throw new ExplanationError(
          "The AI response failed validation, including its source references. Please retry.",
          502,
        );
      }
      const value: ExplanationResult = {
        explanation,
        model,
        promptVersion: PROMPT_VERSION,
        repository: data.repository,
        commit: data.commit,
        path: data.path,
        blobSha: data.blobSha,
        suppliedLines: data.suppliedLines,
        totalLines: data.totalLines,
        truncated: data.truncated,
        dependenciesTruncated: data.dependenciesTruncated,
      };
      while (cache.size >= 32) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: now() + 30 * 60000 });
      return value;
    })();
    running.set(key, task);
    try {
      return await task;
    } finally {
      running.delete(key);
    }
  };
}
const runtime = globalThis as typeof globalThis & {
  repoVerseExplain?: ReturnType<typeof createExplanationService>;
  repoVerseExplainVersion?: string;
};
// In development, hot reload can retain globals holding an older provider closure.
if (
  !runtime.repoVerseExplain ||
  runtime.repoVerseExplainVersion !== PROMPT_VERSION
) {
  runtime.repoVerseExplain = createExplanationService();
  runtime.repoVerseExplainVersion = PROMPT_VERSION;
}
export const explainFile = runtime.repoVerseExplain;
