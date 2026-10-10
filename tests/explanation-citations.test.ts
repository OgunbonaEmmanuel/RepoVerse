import { it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { sourceLines, numberedSource } from "../lib/source-lines";
import { validateExplanation, type SourceReference } from "../lib/explanation";
import { prepareExplanation, PROMPT_VERSION } from "../lib/explanation-input";
import { createExplanationService } from "../lib/explanation-service";
import {
  expressExplanation,
  expressExplanationSource as source,
  expressExplanationInput as input,
} from "./fixtures/express-explanation";

it("pins the exact Express blob and independently checks all reported source ranges", () => {
  expect(Buffer.byteLength(source)).toBe(1636);
  expect(createHash("sha256").update(source).digest("hex")).toBe(
    "4f35e8273a5e78c35e778d14e4a8c80a81ca3e1fc8047dc87d2077b860404572",
  );
  expect(createHash("sha1").update(`blob 1636\0${source}`).digest("hex")).toBe(
    input.blobSha,
  );
  const lines = sourceLines(source);
  expect(lines[35]).toBe("function createApplication() {");
  expect(lines[54]).toBe("  return app;");
  expect(lines[55]).toBe("}");
  for (const item of expressExplanation.symbols.slice(1)) {
    const ref = item.references[0];
    expect(lines.slice(ref.start - 1, ref.end).join("\n")).toBe(ref.excerpt);
  }
  expect(lines[37]).toBe("    app.handle(req, res, next);");
  expect(
    validateExplanation(expressExplanation, source).symbols.every((item) =>
      item.references.every((ref) => ref.verification === "matched"),
    ),
  ).toBe(true);
});

it.each([
  [
    {
      start: 62,
      end: 64,
      excerpt: expressExplanation.symbols[1].references[0].excerpt,
    },
    "matched",
  ],
  [
    {
      start: 61,
      end: 63,
      excerpt: expressExplanation.symbols[1].references[0].excerpt,
    },
    "excerpt-mismatch",
  ],
  [
    { start: 90, end: 92, excerpt: "exports.application = proto;" },
    "out-of-range",
  ],
  [{ start: 0, end: 1, excerpt: "/*!" }, "out-of-range"],
  [{ start: 10, end: 9, excerpt: "'use strict';" }, "out-of-range"],
] as const)(
  "flags evidence locally with no repair requests: %o",
  async (reference, expected) => {
    const output = structuredClone(expressExplanation);
    output.symbols[1].references = [{ ...reference, verification: "matched" }];
    const provider = vi.fn().mockResolvedValue(output);
    const explain = createExplanationService(provider);
    const result = await explain(input, { apiKey: "mock-key" });
    expect(result.explanation.symbols[1].references[0].verification).toBe(
      expected,
    );
    expect(result.explanation.purpose[0].references[0].verification).toBe(
      "matched",
    );
    expect(result.promptVersion).toBe(PROMPT_VERSION);
    expect(await explain(input, { apiKey: "mock-key" })).toEqual(result);
    expect(provider).toHaveBeenCalledTimes(1);
  },
);

it("preserves comments, blank/trailing lines and CRLF/LF numbering", () => {
  const lf = "// comment\n\nexport const x = 1;\n";
  const crlf = lf.replaceAll("\n", "\r\n");
  expect(sourceLines(crlf)).toEqual([
    "// comment",
    "",
    "export const x = 1;",
    "",
  ]);
  expect(numberedSource(crlf)).toBe(
    "1: // comment\n2: \n3: export const x = 1;\n4: ",
  );
  expect(prepareExplanation({ ...input, source: crlf }).source).toBe(lf);
  const result = validateExplanation(
    expressExplanation,
    source.replaceAll("\n", "\r\n"),
  );
  expect(result).toEqual(validateExplanation(expressExplanation, source));
});

it("checks repeated excerpts only at their claimed range and rejects blank or overly broad quotes", () => {
  const text = "call();\n// gap\ncall();\n\n";
  const check = (ref: SourceReference) =>
    validateExplanation(
      {
        purpose: [{ text: "Calls a function.", references: [ref] }],
        symbols: [],
        imports: [],
        limitations: [],
      },
      text,
    ).purpose[0].references[0].verification;
  expect(check({ start: 3, end: 3, excerpt: "call();" })).toBe("matched");
  expect(check({ start: 2, end: 2, excerpt: "call();" })).toBe(
    "excerpt-mismatch",
  );
  expect(check({ start: 1, end: 3, excerpt: "call();" })).toBe(
    "excerpt-mismatch",
  );
  expect(check({ start: 4, end: 4, excerpt: "" })).toBe("excerpt-mismatch");
});

it("rejects omitted lines even if their quoted text exists in the full source", () => {
  const full = source + "\n// tail".repeat(900);
  const prepared = prepareExplanation({ ...input, source: full });
  expect(prepared.suppliedLines).toBe(800);
  expect(prepared.truncated).toBe(true);
  const output = structuredClone(expressExplanation);
  output.imports[0].references = [{ start: 801, end: 801, excerpt: "// tail" }];
  expect(
    validateExplanation(output, prepared.source).imports[0].references[0]
      .verification,
  ).toBe("out-of-range");
  expect(
    validateExplanation(output, full, prepared.suppliedLines).imports[0]
      .references[0].verification,
  ).toBe("out-of-range");
});
