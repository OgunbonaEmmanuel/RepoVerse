import { describe, expect, it } from "vitest";
import { inventoryFixture } from "./fixtures/inventory";
import { classifyFile, colors } from "../lib/file-types";
import { cityLayout, METADATA_HEIGHT } from "../lib/layout";
describe("inventory independent of content", () => {
  it("includes data, serialized, oversized and unknown files in their actual folders without fetching blobs", async () => {
    const { graph, requests, entries } = await inventoryFixture();
    expect(graph.files).toHaveLength(14);
    expect(graph.exclusions).toHaveLength(3);
    expect(graph.inventoryIncomplete).toBe(false);
    const fetched = entries
      .filter((e) => requests.some((r) => r.endsWith(`/git/blobs/${e.sha}`)))
      .map((e) => e.path)
      .sort();
    expect(fetched).toEqual([
      "README.md",
      "assets/lfs.txt",
      "config/settings.yaml",
      "src/helper.ts",
      "src/main.ts",
    ]);
    const layout = cityLayout(graph.files);
    expect(layout.buildings).toHaveLength(graph.files.length);
    for (const path of [
      "data/movies.csv",
      "models/movie_list.pkl",
      "models/similarity.pkl",
      "src/huge.ts",
    ]) {
      const file = graph.files.find((f) => f.id === path)!;
      const building = layout.buildings.find((b) => b.id === path)!;
      expect(file.source).toBeNull();
      expect(file.lines).toBeNull();
      expect(file.githubUrl).toContain(`/blob/${graph.commit}/${path}`);
      expect(building.district).toBe(path.slice(0, path.lastIndexOf("/")));
      expect(building.height).toBe(METADATA_HEIGHT);
      expect(building.metadataOnly).toBe(true);
    }
    expect(
      graph.files.find((f) => f.id === "opaque/unknown-size")?.bytes,
    ).toBeNull();
    expect(graph.files.find((f) => f.id === "src/huge.ts")?.status).toBe(
      "not analysed",
    );
    expect(
      graph.files.find((f) => f.id === "models/movie_list.pkl")?.contentStatus,
    ).toBe("binary");
    expect(
      graph.files.find((f) => f.id === "models/similarity.pkl")?.contentStatus,
    ).toBe("too-large");
    expect(
      graph.files.find((f) => f.id === "data/movies.csv")?.contentStatus,
    ).toBe("not-loaded");
    expect(
      graph.imports
        .filter((e) => e.kind === "internal")
        .map((e) => e.to)
        .sort(),
    ).toEqual(["data/movies.csv", "models/movie_list.pkl", "src/helper.ts"]);
    expect(graph.imports.every((e) => e.from === "src/main.ts")).toBe(true);
  });
  it("distinguishes Git pointer bytes from declared LFS asset size without fetching the asset", async () => {
    const { graph, requests } = await inventoryFixture();
    const pointer = graph.files.find((f) => f.id === "assets/lfs.txt")!;
    expect(pointer.contentStatus).toBe("lfs");
    expect(pointer.lfs).toEqual({
      pointerBytes: pointer.bytes,
      assetBytes: 123456789,
      oid: "d".repeat(64),
    });
    expect(pointer.source).toBeNull();
    expect(pointer.lines).toBeNull();
    expect(
      requests.every((r) =>
        r.startsWith("https://api.github.com/repos/fixture/movie-inventory"),
      ),
    ).toBe(true);
  });
  it("classifies categories centrally with distinct colours and case-insensitive extensions", () => {
    const cases = {
      "Source code": "main.TS",
      Data: "movies.CSV",
      "Serialized files": "model.PKL",
      "Images / media": "poster.PNG",
      Documentation: "README.md",
      Archives: "dataset.tar.gz",
      Configuration: "settings.yaml",
      Unknown: "opaque.thing",
    };
    for (const [category, path] of Object.entries(cases))
      expect(classifyFile(path)).toBe(category);
    expect(new Set(Object.values(colors)).size).toBe(8);
  });
});
