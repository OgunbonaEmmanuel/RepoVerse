import { importGitHub } from "../../lib/github";
export const fixtureCommit = "a".repeat(40);
export const inventoryFixtureEntries = [
  {
    path: "README.md",
    source: "# Offline inventory fixture\nSynthetic movie data repository.",
  },
  {
    path: "src/main.ts",
    source:
      "import './helper'; import '../data/movies.csv'; import '../models/movie_list.pkl';",
  },
  { path: "src/helper.ts", source: "export const title = 'fixture';" },
  { path: "data/movies.csv", size: 1200 },
  { path: "data/large.csv", size: 30_000_000 },
  { path: "models/movie_list.pkl", size: 2400 },
  { path: "models/similarity.pkl", size: 80_000_000 },
  { path: "images/poster.png", size: 4096 },
  { path: "archives/data.zip", size: 9000 },
  { path: "config/settings.yaml", source: "fixture: true" },
  { path: "opaque/custom.weird", size: 10 },
  { path: "opaque/unknown-size", size: undefined },
  { path: "src/huge.ts", size: 600_000 },
  {
    path: "assets/lfs.txt",
    source: `version https://git-lfs.github.com/spec/v1\noid sha256:${"d".repeat(64)}\nsize 123456789\n`,
  },
  { path: "node_modules/package/index.js", source: "excluded" },
  { path: "dist/output.js", source: "excluded" },
  { path: "package-lock.json", source: "{}" },
];
/** No network. Only the explicitly listed text sources can produce blob responses. */
export async function inventoryFixture() {
  const requests: string[] = [];
  const entries = inventoryFixtureEntries.map((e, i) => ({
    path: e.path,
    type: "blob",
    mode: "100644",
    sha: (i + 1).toString(16).padStart(40, "0"),
    size: e.source !== undefined ? Buffer.byteLength(e.source) : e.size,
  }));
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/fixture/movie-inventory"))
      return Response.json({ private: false, default_branch: "main" });
    if (url.endsWith("/commits/main"))
      return Response.json({
        sha: fixtureCommit,
        commit: { tree: { sha: "b".repeat(40) } },
      });
    if (url.includes("/git/trees/"))
      return Response.json({ truncated: false, tree: entries });
    const index = entries.findIndex((e) => url.endsWith(`/git/blobs/${e.sha}`));
    const source = inventoryFixtureEntries[index]?.source;
    if (source === undefined)
      throw new Error(`Unexpected content request: ${url}`);
    return Response.json({
      encoding: "base64",
      content: Buffer.from(source).toString("base64"),
      size: Buffer.byteLength(source),
    });
  };
  const graph = await importGitHub(
    "https://github.com/fixture/movie-inventory",
    { fetcher },
  );
  graph.demo = true;
  graph.name = "Offline movie inventory fixture (synthetic)";
  return { graph, requests, entries };
}
