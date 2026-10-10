import { describe, it, expect } from "vitest";
import { analyze } from "../lib/analyze";
import { dependencyMessage } from "../lib/dependency-message";
import { inventoryFile } from "../lib/inventory";
import { ContentStatus, LIMITS } from "../lib/model";
const metadata = {
  name: "dependency message fixture",
  commit: "test",
  demo: true,
};
describe("dependency messages", () => {
  it("distinguishes unsupported files from successfully analysed files without imports", () => {
    const graph = analyze(
      [
        { path: "a.py", source: "import os" },
        { path: "b.ts", source: "export const x = 1" },
      ],
      metadata,
    );
    expect(dependencyMessage(graph.files[0], "outgoing", graph.imports)).toBe(
      "Dependency analysis is not supported for this file type.",
    );
    expect(dependencyMessage(graph.files[1], "outgoing", graph.imports)).toBe(
      "No imports found.",
    );
  });
  it.each<[ContentStatus, string]>([
    ["not-loaded", "contents have not been loaded"],
    ["too-large", "exceeds the preview size limit"],
    ["download-limit", "download budget was reached"],
    ["error", "download failed or was interrupted"],
    ["binary", "could not be read as UTF-8"],
    ["lfs", "asset has not been downloaded"],
    ["loaded", "analysis has not run"],
  ])(
    "explains why a supported file was not analysed (%s)",
    (contentStatus, reason) => {
      const file = { ...inventoryFile("file.ts", 20, LIMITS), contentStatus };
      expect(dependencyMessage(file, "outgoing", [])).toContain(reason);
      expect(dependencyMessage(file, "outgoing", [])).not.toBe(
        "No imports found.",
      );
    },
  );
  it("reports external and unresolved imports instead of claiming there are no imports", () => {
    const graph = analyze(
      [
        {
          path: "a.ts",
          source:
            "import React from 'react'; import './missing'; import(variable);",
        },
      ],
      metadata,
    );
    expect(graph.imports.map((e) => e.kind)).toEqual([
      "external",
      "unresolved",
      "unresolved",
    ]);
    expect(
      dependencyMessage(graph.files[0], "outgoing", graph.imports),
    ).toContain("Imports were detected");
    expect(graph.imports.every((e) => e.reason)).toBe(true);
  });
  it("warns about syntax errors with or without extracted imports", () => {
    for (const source of ["const x =", "import './b'; const x ="]) {
      const graph = analyze(
        [
          { path: "a.ts", source },
          { path: "b.ts", source: "export {}" },
        ],
        metadata,
      );
      expect(graph.files[0].status).toBe("syntax errors");
      expect(
        dependencyMessage(graph.files[0], "outgoing", graph.imports),
      ).toContain("analysis is incomplete");
    }
  });
  it("keeps incoming connections for unsupported and unanalysed targets and qualifies missing incoming edges", () => {
    const graph = analyze(
      [
        { path: "a.ts", source: "import './data.csv'; import './huge.ts'" },
        { path: "data.csv", source: "a,b" },
        { path: "huge.ts", source: " ".repeat(LIMITS.perFile + 1) },
      ],
      metadata,
    );
    for (const path of ["data.csv", "huge.ts"]) {
      const file = graph.files.find((f) => f.id === path)!;
      expect(dependencyMessage(file, "incoming", graph.imports)).toBeNull();
      expect(dependencyMessage(file, "incoming", [])).toBe(
        "No incoming imports found among analysed files.",
      );
    }
  });
});
