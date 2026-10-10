import { describe, it, expect } from "vitest";
import { demoGraph } from "../lib/demo";
import { analyze } from "../lib/analyze";
describe("real parser and resolver", () => {
  it("extracts exact directed edges including cycles, indexes, JS substitution and require", () => {
    const g = demoGraph();
    expect(g.files).toHaveLength(11);
    expect(
      g.imports
        .filter((e) => e.kind === "internal")
        .map((e) => `${e.from}->${e.to}`)
        .sort(),
    ).toEqual(
      [
        "src/main.ts->src/ui/App.tsx",
        "src/main.ts->src/styles.css",
        "src/ui/App.tsx->src/data/index.ts",
        "src/ui/App.tsx->src/utils/format.ts",
        "src/data/index.ts->src/data/store.ts",
        "src/data/store.ts->src/utils/format.ts",
        "src/utils/format.ts->src/data/store.ts",
        "src/legacy.cjs->src/ui/App.tsx",
        "src/aliases.ts->src/data/index.ts",
      ].sort(),
    );
    expect(
      g.imports
        .filter((e) => e.kind === "external")
        .map((e) => e.specifier)
        .sort(),
    ).toEqual(["node:fs", "react"]);
    expect(
      g.imports
        .filter((e) => e.kind === "unresolved")
        .map((e) => e.specifier)
        .sort(),
    ).toEqual(["./missing", "@/config", "variable"]);
    expect(g.files.find((f) => f.id.endsWith(".py"))?.status).toBe(
      "unsupported",
    );
  });
  it("does not invent imports from comments or strings; reports syntax errors", () => {
    const g = analyze(
      [
        {
          path: "a.ts",
          source:
            '// import x from "./fake"\nconst s = "require(\'fake\')";\nimport {',
        },
      ],
      { name: "test", commit: "x", demo: true },
    );
    expect(
      g.imports.every(
        (e) => e.specifier !== "./fake" && e.specifier !== "fake",
      ),
    ).toBe(true);
    expect(g.files[0].status).toBe("syntax errors");
  });
  it("enforces exclusions and byte/count limits without silently completing", () => {
    const g = analyze(
      [
        { path: "../evil.ts", source: "" },
        { path: "dist/a.js", source: "" },
        { path: "package-lock.json", source: "" },
        { path: "a.ts", source: "éé" },
        { path: "b.ts", source: "12345" },
        { path: "c.ts", source: "x" },
      ],
      { name: "x", commit: "x", demo: true },
      { files: 1, perFile: 4, total: 4 },
    );
    expect(g.files.map((f) => f.id)).toEqual(["a.ts"]);
    expect(g.files[0].bytes).toBe(4);
    expect(g.exclusions).toHaveLength(5);
    expect(g.partial).toBe(true);
  });
});
