import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { importGitHub } from "../../lib/github";
export const expressCommit = "a419aa7350389a275ab45fde2e849ed1f02449ef";
export const expressPaths = [
  "examples/route-map/index.js",
  "examples/route-middleware/index.js",
  "lib/application.js",
  "lib/express.js",
  "lib/request.js",
  "lib/response.js",
];
export const expressSources = new Map(
  expressPaths.map((path) => [
    path,
    readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/express",
        path.replaceAll("/", "_") + ".txt",
      ),
      "utf8",
    ),
  ]),
);
export const expressBlobs = new Map(
  [...expressSources].map(([path, source]) => [
    path,
    createHash("sha1")
      .update(`blob ${Buffer.byteLength(source)}\0${source}`)
      .digest("hex"),
  ]),
);
/** Offline partial Express inventory; real pinned source, synthetic failure and extra metadata test entries. */
export async function expressFixture(
  failure = new Response("", { status: 503 }),
) {
  const requests: string[] = [];
  const blob = (source: string) =>
    Response.json({
      encoding: "base64",
      content: Buffer.from(source).toString("base64"),
    });
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/express"))
      return Response.json({ private: false, default_branch: "master" });
    if (url.includes("/commits/"))
      return Response.json({
        sha: expressCommit,
        commit: { tree: { sha: "b".repeat(40) } },
      });
    if (url.includes("/git/trees/"))
      return Response.json({
        truncated: false,
        tree: [
          ...[...expressSources].map(([path, source]) => ({
            path,
            type: "blob",
            mode: "100644",
            size: Buffer.byteLength(source),
            sha: expressBlobs.get(path),
          })),
          {
            path: "test-data/model.pkl",
            type: "blob",
            mode: "100644",
            size: 200,
            sha: "c".repeat(40),
          },
          {
            path: "test-data/huge.js",
            type: "blob",
            mode: "100644",
            size: 800_000,
            sha: "d".repeat(40),
          },
        ],
      });
    const path = [...expressBlobs].find(([, sha]) => url.endsWith(sha))?.[0];
    if (path === "lib/express.js") return failure;
    if (!path) throw new Error("Unexpected fixture request");
    return blob(expressSources.get(path)!);
  };
  const graph = await importGitHub("https://github.com/expressjs/express", {
    fetcher,
  });
  graph.name = "Offline Express recovery fixture (partial inventory)";
  graph.demo = true;
  const recoverRequests: string[] = [];
  const recoverFetcher: typeof fetch = async (input) => {
    recoverRequests.push(String(input));
    if (!String(input).endsWith(expressBlobs.get("lib/express.js")!))
      throw new Error("Unexpected recovery request");
    return blob(expressSources.get("lib/express.js")!);
  };
  return { graph, requests, recoverFetcher, recoverRequests };
}
