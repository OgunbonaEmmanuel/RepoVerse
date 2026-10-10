import { it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import { scaleGraph } from "../lib/scale";
import { cityLayout } from "../lib/layout";
it("measures a deterministic 1000-file cyclic scene fixture", () => {
  const start = performance.now();
  const graph = scaleGraph();
  const parsed = performance.now();
  const layout = cityLayout(graph.files);
  const ended = performance.now();
  expect(graph.files).toHaveLength(1000);
  expect(graph.imports.filter((e) => e.kind === "internal")).toHaveLength(1000);
  expect(graph.partial).toBe(false);
  expect(layout.districts).toHaveLength(21);
  expect(layout.buildings).toHaveLength(1000);
  expect(cityLayout([...graph.files].reverse())).toEqual(layout);
  console.log(
    JSON.stringify({
      fixture: "generated-scale-v1",
      files: 1000,
      edges: 1000,
      districts: layout.districts.length,
      parseMs: +(parsed - start).toFixed(2),
      layoutMs: +(ended - parsed).toFixed(2),
      payloadBytes: Buffer.byteLength(JSON.stringify(graph)),
    }),
  );
});
