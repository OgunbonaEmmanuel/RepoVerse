import { it, expect } from "vitest";
import { importGitHub } from "../lib/github";
import { retrySourceFile } from "../lib/file-recovery";
import { applyFileRecovery } from "../lib/apply-recovery";
import { connected } from "../lib/model";
import { expressPaths } from "./fixtures/express";

it.skipIf(process.env.REPOVERSE_LIVE_EXPRESS !== "1")(
  "live GitHub: recover Express from actual tree/blob SHAs after an injected failure",
  async () => {
    const requests: string[] = [];
    let expressSha = "";
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (expressSha && url.endsWith("/git/blobs/" + expressSha))
        return new Response("", { status: 503 }); // Failure is deliberately injected, never claimed as a live GitHub failure.
      const response = await fetch(input, init);
      if (!response.ok || !url.includes("/git/trees/")) return response;
      const tree = await response.json();
      const entries = tree.tree.filter((entry: { path: string; sha: string }) =>
        expressPaths.includes(entry.path),
      );
      expressSha = entries.find(
        (entry: { path: string }) => entry.path === "lib/express.js",
      ).sha;
      // Six-file verification scope, visibly incomplete; avoid downloading the whole Express repository.
      return Response.json({ ...tree, tree: entries, truncated: true });
    };
    const graph = await importGitHub("https://github.com/expressjs/express", {
      fetcher,
    });
    expect(graph.files).toHaveLength(6);
    const downloads: string[] = [];
    const recovery = await retrySourceFile(
      {
        recoveryId: graph.recoveryId,
        commit: graph.commit,
        path: "lib/express.js",
      },
      {
        fetcher: async (url, init) => {
          downloads.push(String(url));
          return fetch(url, init);
        },
      },
    );
    const next = applyFileRecovery(graph, recovery);
    expect(
      connected(next, "lib/express.js", "outgoing").map((e) => e.to),
    ).toEqual(["lib/application.js", "lib/request.js", "lib/response.js"]);
    expect(
      connected(next, "lib/express.js", "incoming").map((e) => e.from),
    ).toEqual([
      "examples/route-map/index.js",
      "examples/route-middleware/index.js",
    ]);
    expect(
      connected(next, "lib/request.js", "incoming").some((e) =>
        e.from.startsWith("examples/"),
      ),
    ).toBe(false);
    expect(downloads).toEqual([
      "https://api.github.com/repos/expressjs/express/git/blobs/" + expressSha,
    ]);
    console.log(
      JSON.stringify({
        verification:
          "live six-file inventory with injected 503, real single-blob recovery",
        commit: graph.commit,
        bytes: recovery.file.bytes,
        sourceBytes: Buffer.byteLength(recovery.file.source!),
        incoming: connected(next, "lib/express.js", "incoming"),
        outgoing: connected(next, "lib/express.js", "outgoing"),
        actualRequests: requests.length - 1 + downloads.length,
      }),
    );
  },
  60000,
);
