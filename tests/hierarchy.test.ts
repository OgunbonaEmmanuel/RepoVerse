import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  cityLayout,
  visibleCity,
  dependencySegments,
  folderAncestors,
  revealFolder,
  PADDING,
  LABEL_SPACE,
  District,
  Building,
} from "../lib/layout";
import { cameraPose } from "../lib/city-camera";
import { demoGraph } from "../lib/demo";
import { analyze } from "../lib/analyze";
function rect(item: District | Building) {
  return {
    left: item.x - ("width" in item ? item.width : 1.15) / 2,
    right: item.x + ("width" in item ? item.width : 1.15) / 2,
    top: item.z - ("depth" in item ? item.depth : 1.15) / 2,
    bottom: item.z + ("depth" in item ? item.depth : 1.15) / 2,
  };
}
function disjoint(a: District | Building, b: District | Building) {
  const x = rect(a),
    y = rect(b);
  return (
    x.right <= y.left ||
    y.right <= x.left ||
    x.bottom <= y.top ||
    y.bottom <= x.top
  );
}
describe("recursive city hierarchy", () => {
  it("contains every child and direct file within its actual parent, with a reserved label strip", () => {
    const layout = cityLayout(demoGraph().files);
    const byName = new Map(layout.districts.map((d) => [d.name, d]));
    expect(byName.get("src")?.children).toEqual([
      "src/data",
      "src/ui",
      "src/utils",
    ]);
    expect(byName.get("")?.children).toEqual(["scripts", "src"]);
    for (const parent of layout.districts) {
      const p = rect(parent);
      const children = layout.districts.filter((d) => d.parent === parent.name);
      const direct = layout.buildings.filter((b) => b.district === parent.name);
      const contents = [...children, ...direct];
      for (const item of contents) {
        const r = rect(item);
        expect(r.left).toBeGreaterThanOrEqual(p.left + PADDING - 1e-8);
        expect(r.right).toBeLessThanOrEqual(p.right - PADDING + 1e-8);
        expect(r.top).toBeGreaterThanOrEqual(
          p.top + PADDING + LABEL_SPACE - 1e-8,
        );
        expect(r.bottom).toBeLessThanOrEqual(p.bottom - PADDING + 1e-8);
      }
      for (let i = 0; i < contents.length; i++)
        for (let j = i + 1; j < contents.length; j++)
          expect(disjoint(contents[i], contents[j])).toBe(true);
      for (const child of children)
        expect(child.elevation).toBeGreaterThan(parent.elevation);
    }
  });
  it("places each file once, keeps root files outside top-level folders, and is deterministic", () => {
    const files = demoGraph().files,
      layout = cityLayout(files);
    expect(layout.buildings.map((b) => b.id).sort()).toEqual(
      files.map((f) => f.id).sort(),
    );
    expect(new Set(layout.buildings.map((b) => b.id)).size).toBe(files.length);
    expect(layout.buildings.find((b) => b.id === "README.md")?.district).toBe(
      "",
    );
    expect(layout.buildings.find((b) => b.id === "src/main.ts")?.district).toBe(
      "src",
    );
    expect(cityLayout([...files].reverse())).toEqual(layout);
    for (const b of layout.buildings) {
      const f = files.find((f) => f.id === b.id)!;
      expect(b.height).toBe(Math.min(10, 0.6 + Math.log2(1 + f.lines!) * 0.65));
    }
  });
  it("includes fileless intermediate folders, deep nesting and an empty repository boundary", () => {
    const path =
      Array.from({ length: 80 }, (_, i) => `level${i}`).join("/") + "/leaf.ts";
    const graph = analyze(
      [
        { path, source: "export {}" },
        { path: "root.ts", source: "" },
      ],
      { name: "deep test fixture", commit: "test", demo: true },
    );
    const layout = cityLayout(graph.files);
    expect(layout.districts).toHaveLength(81);
    expect(layout.buildings).toHaveLength(2);
    expect(layout.districts[1].directFileCount).toBe(0);
    expect(layout.districts[0].fileCount).toBe(2);
    for (const d of layout.districts.filter((d) => d.parent !== null)) {
      const parent = layout.districts.find((p) => p.name === d.parent)!;
      expect(rect(d).left).toBeGreaterThan(rect(parent).left);
      expect(rect(d).right).toBeLessThan(rect(parent).right);
    }
    expect(cityLayout([]).districts).toHaveLength(1);
    expect(cityLayout([]).extent).toBeGreaterThan(0);
  });
  it("collapses by visibility without moving files; reveal expands exactly the required ancestors", () => {
    const layout = cityLayout(demoGraph().files),
      collapsed = new Set(["src", "src/ui", "scripts"]);
    const view = visibleCity(layout, collapsed);
    expect(view.districts.map((d) => d.name).sort()).toEqual([
      "",
      "scripts",
      "src",
    ]);
    expect(view.buildings.every((b) => b.district === "")).toBe(true);
    expect(view.hiddenBy.get("src/ui/App.tsx")).toBe("src");
    expect(folderAncestors("src/ui")).toEqual(["", "src", "src/ui"]);
    const revealed = revealFolder(collapsed, "src/ui");
    expect([...revealed]).toEqual(["scripts"]);
    expect(
      visibleCity(layout, revealed).buildings.find(
        (b) => b.id === "src/ui/App.tsx",
      ),
    ).toEqual(layout.buildings.find((b) => b.id === "src/ui/App.tsx"));
  });
  it("draws dependencies at elevated file roofs and omits hidden endpoints rather than substituting a folder", () => {
    const graph = demoGraph(),
      layout = cityLayout(graph.files);
    const edges = graph.imports.filter(
      (e) => e.from === "src/main.ts" && e.kind === "internal",
    );
    const view = visibleCity(layout, new Set(["src/ui"]));
    const segments = dependencySegments(edges, view);
    expect(segments.map((s) => s.edge.to)).toEqual(["src/styles.css"]);
    const a = layout.buildings.find((b) => b.id === "src/main.ts")!,
      b = layout.buildings.find((b) => b.id === "src/styles.css")!;
    expect(segments[0].from).toEqual([a.x, a.baseY + a.height + 0.3, a.z]);
    expect(segments[0].to).toEqual([b.x, b.baseY + b.height + 0.3, b.z]);
    expect(
      dependencySegments(edges, visibleCity(layout, new Set(["src"]))),
    ).toEqual([]);
  });
  it("fits the complete initial city at wide and narrow aspect ratios", () => {
    const layout = cityLayout(demoGraph().files),
      root = layout.districts[0];
    const top = Math.max(...layout.buildings.map((b) => b.baseY + b.height));
    for (const aspect of [0.6, 1, 2]) {
      const pose = cameraPose(layout, { kind: "repository", id: "" }, aspect);
      const camera = new PerspectiveCamera(45, aspect, 0.1, pose.far);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      for (const x of [-root.width / 2, root.width / 2])
        for (const z of [-root.depth / 2, root.depth / 2])
          for (const y of [0, top]) {
            const point = new Vector3(x, y, z).project(camera);
            expect(Math.abs(point.x)).toBeLessThan(1);
            expect(Math.abs(point.y)).toBeLessThan(1);
          }
    }
  });
});
