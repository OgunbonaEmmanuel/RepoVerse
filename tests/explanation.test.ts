import { describe, it, expect, vi } from "vitest";
import { createExplanationService } from "../lib/explanation-service";
import {
  prepareExplanation,
  SOURCE_BYTE_LIMIT,
} from "../lib/explanation-input";
import {
  explanationUnavailable,
  validateExplanation,
} from "../lib/explanation";
import { explanationFixture, explanationInput } from "./fixtures/explanation";
import { inventoryFile } from "../lib/inventory";
import { LIMITS } from "../lib/model";
const config = { apiKey: "test-placeholder", model: "gpt-4.1-mini" };
describe("bounded file explanations", () => {
  it("accepts no specific limitations and rejects verbose or oversized sections", () => {
    expect(
      validateExplanation(
        { ...explanationFixture, limitations: [] },
        explanationInput.source,
      ).limitations,
    ).toEqual([]);
    expect(() =>
      validateExplanation(
        {
          ...explanationFixture,
          purpose: Array(2).fill(explanationFixture.purpose[0]),
        },
        explanationInput.source,
      ),
    ).toThrow();
    expect(() =>
      validateExplanation(
        {
          ...explanationFixture,
          limitations: Array(3).fill(explanationFixture.limitations[0]),
        },
        explanationInput.source,
      ),
    ).toThrow();
    expect(() =>
      validateExplanation(
        {
          ...explanationFixture,
          symbols: [
            { text: "x".repeat(601), references: [{ start: 1, end: 2 }] },
          ],
        },
        explanationInput.source,
      ),
    ).toThrow();
  });
  it("returns validated structured sections and reuses completed and in-flight requests", async () => {
    const provider = vi.fn().mockResolvedValue(explanationFixture);
    const explain = createExplanationService(provider);
    const [a, b] = await Promise.all([
      explain(explanationInput, config),
      explain(explanationInput, config),
    ]);
    expect(a).toEqual(b);
    expect(a.explanation).toEqual(
      validateExplanation(explanationFixture, explanationInput.source),
    );
    expect(a.blobSha).toMatch(/^[a-f0-9]{40}$/);
    expect(await explain(explanationInput, config)).toEqual(a);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toMatchObject({
      language: "TypeScript",
      path: "src/greet.ts",
      suppliedLines: 3,
    });
  });
  it("does not call the provider without credentials or consent", async () => {
    const provider = vi.fn();
    const explain = createExplanationService(provider);
    await expect(explain(explanationInput, {})).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
    await expect(
      explain({ ...explanationInput, consent: false }, config),
    ).rejects.toThrow("Confirm");
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...explanationFixture, extra: "unexpected" },
    {
      ...explanationFixture,
      purpose: [{ text: "Invalid", references: [{ start: 0, end: 2 }] }],
    },
    {
      ...explanationFixture,
      purpose: [{ text: "Invalid", references: [{ start: 2, end: 1 }] }],
    },
    {
      ...explanationFixture,
      purpose: [{ text: "Invalid", references: [{ start: 1, end: 4 }] }],
    },
    { ...explanationFixture, purpose: [{ text: "Invalid", references: [] }] },
  ])(
    "rejects invalid structure or citations without caching the failure",
    async (output) => {
      const provider = vi
        .fn()
        .mockResolvedValueOnce(output)
        .mockResolvedValueOnce(explanationFixture);
      const explain = createExplanationService(provider);
      await expect(explain(explanationInput, config)).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining("validation"),
      });
      expect((await explain(explanationInput, config)).explanation).toEqual(
        validateExplanation(explanationFixture, explanationInput.source),
      );
      expect(provider).toHaveBeenCalledTimes(2);
    },
  );
  it("sanitizes provider failures and allows explicit retry", async () => {
    const provider = vi
      .fn()
      .mockRejectedValueOnce(new Error("SECRET_PROVIDER_DETAILS"))
      .mockResolvedValueOnce(explanationFixture);
    const explain = createExplanationService(provider);
    await expect(explain(explanationInput, config)).rejects.toMatchObject({
      message: expect.not.stringContaining("SECRET_PROVIDER_DETAILS"),
    });
    expect((await explain(explanationInput, config)).explanation).toEqual(
      validateExplanation(explanationFixture, explanationInput.source),
    );
  });
  it("isolates repositories, commits, paths, blobs, models, source and metadata", async () => {
    const provider = vi.fn().mockResolvedValue(explanationFixture);
    const explain = createExplanationService(provider);
    await explain(explanationInput, config);
    for (const difference of [
      { repository: "other/repo" },
      { commit: "other" },
      { path: "other.ts" },
      { blobSha: "a".repeat(40) },
      { source: explanationInput.source + "\n" },
      { dependencies: [{ specifier: "pkg", kind: "external", line: 1 }] },
    ])
      await explain({ ...explanationInput, ...difference }, config);
    await explain(explanationInput, { ...config, model: "other-model" });
    expect(provider).toHaveBeenCalledTimes(8);
  });
  it("expires cache entries and caps the cache at 32 successful results", async () => {
    let now = 0;
    const provider = vi.fn().mockResolvedValue(explanationFixture);
    const explain = createExplanationService(provider, () => now);
    for (let i = 0; i < 33; i++) {
      if (i % 8 === 0) now += 61000;
      await explain({ ...explanationInput, path: `src/file${i}.ts` }, config);
    }
    await explain({ ...explanationInput, path: "src/file0.ts" }, config);
    expect(provider).toHaveBeenCalledTimes(34);
    now += 30 * 60000;
    await explain({ ...explanationInput, path: "src/file0.ts" }, config);
    expect(provider).toHaveBeenCalledTimes(35);
  });
  it("bounds request rate and concurrent distinct requests", async () => {
    let resolve!: (value: unknown) => void;
    const provider = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const explain = createExplanationService(provider);
    const a = explain(explanationInput, config);
    const resolveA = resolve;
    const b = explain({ ...explanationInput, path: "b.ts" }, config);
    await expect(
      explain({ ...explanationInput, path: "c.ts" }, config),
    ).rejects.toMatchObject({ status: 429 });
    resolveA(explanationFixture);
    resolve(explanationFixture);
    await Promise.all([a, b]);
    const fast = createExplanationService(
      vi.fn().mockResolvedValue(explanationFixture),
    );
    for (let i = 0; i < 8; i++)
      await fast({ ...explanationInput, path: `f${i}.ts` }, config);
    await expect(
      fast({ ...explanationInput, path: "f9.ts" }, config),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("truncates on complete lines and rejects references beyond supplied source", () => {
    const data = prepareExplanation({
      ...explanationInput,
      source: ("// " + "x".repeat(100) + "\n").repeat(1000),
    });
    expect(data.truncated).toBe(true);
    expect(Buffer.byteLength(data.source)).toBeLessThanOrEqual(
      SOURCE_BYTE_LIMIT,
    );
    expect(data.suppliedLines).toBeLessThan(800);
    expect(
      validateExplanation(
        {
          ...explanationFixture,
          purpose: [
            {
              text: "Outside",
              references: [
                {
                  start: 1,
                  end: data.suppliedLines + 1,
                  excerpt: "// omitted",
                },
              ],
            },
          ],
        },
        data.source,
      ).purpose[0].references[0].verification,
    ).toBe("out-of-range");
    expect(() =>
      prepareExplanation({
        ...explanationInput,
        source: "x".repeat(SOURCE_BYTE_LIMIT + 1),
      }),
    ).toThrow("first source line");
  });
  it("rejects sensitive/configuration paths, binary and unsupported files", () => {
    for (const path of [
      ".env",
      ".env.local",
      ".env.local.ts",
      "src/config.ts",
      "src/credentials.js",
      "settings/local.ts",
      ".aws/key.ts",
      "a/../b.ts",
      "photo.png",
      "data.pkl",
    ]) {
      expect(() => prepareExplanation({ ...explanationInput, path })).toThrow(
        "ineligible",
      );
    }
    expect(() =>
      prepareExplanation({ ...explanationInput, source: "\0binary" }),
    ).toThrow("UTF-8");
    expect(
      explanationUnavailable(inventoryFile("file.ts", 100, LIMITS)),
    ).toContain("Load");
  });
});
