import { describe, it, expect, vi } from "vitest";
import { boundedBytes, importGitHub, parseRepository } from "../lib/github";
const sha = "a".repeat(40),
  treeSha = "b".repeat(40),
  blobSha = "c".repeat(40);
function mockApi(
  entries: unknown[],
  source = "export const x=1;",
  truncated = false,
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ private: false, default_branch: "main" }),
    )
    .mockResolvedValueOnce(
      Response.json({ sha, commit: { tree: { sha: treeSha } } }),
    )
    .mockResolvedValueOnce(Response.json({ truncated, tree: entries }))
    .mockImplementation(async () =>
      Response.json({
        encoding: "base64",
        content: Buffer.from(source).toString("base64"),
        size: source.length,
      }),
    );
}
const entry = {
  path: "src/a.ts",
  type: "blob",
  mode: "100644",
  sha: blobSha,
  size: 17,
};
describe("bounded GitHub import", () => {
  it("validates destinations and rejects branches, queries and credentials", () => {
    expect(parseRepository("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
    for (const url of [
      "http://github.com/a/b",
      "https://evil.test/a/b",
      "https://github.com/a/b/tree/main",
      "https://user@github.com/a/b",
      "https://github.com/a/b?x=1",
      "https://github.com/a/b#x",
      "https://github.com/a/%2e%2e",
    ])
      expect(() => parseRepository(url)).toThrow();
  });
  it("pins all tree/blob reads to resolved SHAs, parses real source, detects truncation", async () => {
    const fetcher = mockApi([entry], "import x from './missing';", true);
    const graph = await importGitHub("https://github.com/owner/repo", {
      fetcher,
    });
    expect(graph.commit).toBe(sha);
    expect(graph.demo).toBe(false);
    expect(graph.imports[0].kind).toBe("unresolved");
    expect(graph.partial).toBe(true);
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      "https://api.github.com/repos/owner/repo",
      "https://api.github.com/repos/owner/repo/commits/main",
      `https://api.github.com/repos/owner/repo/git/trees/${treeSha}?recursive=1`,
      `https://api.github.com/repos/owner/repo/git/blobs/${blobSha}`,
    ]);
    expect(
      fetcher.mock.calls.every(
        (c) => (c[1] as RequestInit).redirect === "error",
      ),
    ).toBe(true);
  });
  it("inventories oversized and binary files without fetching; excludes symlinks and generated files", async () => {
    const fetcher = mockApi([
      { ...entry, path: "huge.ts", size: 999 },
      { ...entry, path: "dist/a.ts" },
      { ...entry, path: "link.ts", mode: "120000" },
      { ...entry, path: "image.png" },
      entry,
    ]);
    const g = await importGitHub("https://github.com/a/b", {
      fetcher,
      limits: { files: 10, perFile: 100, total: 100 },
    });
    expect(g.files).toHaveLength(3);
    expect(g.exclusions).toHaveLength(2);
    expect(g.files.find((f) => f.id === "huge.ts")?.contentStatus).toBe(
      "too-large",
    );
    expect(g.files.find((f) => f.id === "image.png")?.contentStatus).toBe(
      "binary",
    );
    expect(g.partial).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("checks actual bytes as well as metadata and rejects non-UTF8", async () => {
    const fetcher = mockApi([entry], "x".repeat(101));
    const g = await importGitHub("https://github.com/a/b", {
      fetcher,
      limits: { files: 1, perFile: 100, total: 100 },
    });
    expect(g.files).toHaveLength(1);
    expect(g.files[0].source).toBeNull();
    expect(g.partial).toBe(true);
    const other = mockApi([entry]);
    other.mockImplementation(async () =>
      Response.json({
        encoding: "base64",
        content: Buffer.from([255]).toString("base64"),
      }),
    );
    const binary = await importGitHub("https://github.com/a/b", {
      fetcher: other,
    });
    expect(binary.files[0].contentReason).toContain("Non-UTF-8");
    expect(binary.files[0].contentStatus).toBe("binary");
    expect(binary.exclusions).toHaveLength(0);
  });
  it("bounds streamed responses, including undeclared sizes", async () => {
    await expect(boundedBytes(new Response("12345"), 4)).rejects.toThrow(
      "byte limit",
    );
    await expect(
      boundedBytes(
        new Response("x", { headers: { "content-length": "100" } }),
        4,
      ),
    ).rejects.toThrow("byte limit");
  });
  it("returns actionable missing, private and rate-limit errors; labels interrupted results", async () => {
    for (const status of [404, 403, 429])
      await expect(
        importGitHub("https://github.com/a/b", {
          fetcher: vi.fn().mockResolvedValue(new Response("", { status })),
        }),
      ).rejects.toThrow(
        status === 404
          ? "not found"
          : status === 403
            ? "denied access"
            : "rate limit",
      );
    await expect(
      importGitHub("https://github.com/a/b", {
        fetcher: vi.fn().mockResolvedValue(Response.json({ private: true })),
      }),
    ).rejects.toThrow("Private");
    const partialFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ private: false, default_branch: "main" }),
      )
      .mockResolvedValueOnce(
        Response.json({ sha, commit: { tree: { sha: treeSha } } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          tree: [entry, { ...entry, path: "src/b.ts" }],
          truncated: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          encoding: "base64",
          content: Buffer.from("export {};").toString("base64"),
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    const g = await importGitHub("https://github.com/a/b", {
      fetcher: partialFetcher,
    });
    expect(g.files).toHaveLength(2);
    expect(g.partial).toBe(true);
    expect(g.files.find((f) => f.id === "src/b.ts")?.contentStatus).toBe(
      "error",
    );
    expect(g.exclusions).toHaveLength(0);
    expect(g.inventoryIncomplete).toBe(false);
  });
  it("counts excluded binary downloads against the total budget", async () => {
    const fetcher = mockApi(
      [
        { ...entry, path: "a.ts", size: 4 },
        { ...entry, path: "b.ts", size: 4 },
      ],
      "\0xxx",
    );
    const graph = await importGitHub("https://github.com/a/b", {
      fetcher,
      limits: { files: 2, perFile: 4, total: 4 },
    });
    expect(graph.files).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(graph.files.map((e) => e.contentStatus)).toEqual([
      "binary",
      "download-limit",
    ]);
    expect(graph.partial).toBe(true);
  });
  it("stops a stalled stream on cancellation", async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ start() {} }));
    const read = boundedBytes(response, 10, controller.signal);
    controller.abort();
    await expect(read).rejects.toThrow("cancelled");
  });
  it("caps inventory independently of contents and reports every known omission", async () => {
    const fetcher = mockApi([
      { ...entry, path: "a.csv", size: 9999 },
      { ...entry, path: "b.pkl", size: 9999 },
      { ...entry, path: "c.ts" },
      { ...entry, path: "dist/out.csv" },
    ]);
    const graph = await importGitHub("https://github.com/a/b", {
      fetcher,
      limits: { files: 2, perFile: 100, total: 100 },
    });
    expect(graph.files.map((f) => f.id)).toEqual(["a.csv", "b.pkl"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(graph.inventoryIncomplete).toBe(true);
    expect(graph.exclusions).toEqual([
      { path: "c.ts", reason: "inventory file-count limit" },
      {
        path: "dist/out.csv",
        reason: "dependency, VCS or generated directory",
      },
    ]);
  });
  it("preserves the entire inventory when the first preview request fails", async () => {
    const fetcher = mockApi([
      entry,
      { ...entry, path: "src/b.ts" },
      { ...entry, path: "data.csv" },
    ]);
    fetcher.mockImplementation(async () => new Response("", { status: 429 }));
    const graph = await importGitHub("https://github.com/a/b", { fetcher });
    expect(graph.files).toHaveLength(3);
    expect(graph.files.filter((f) => f.contentStatus === "error")).toHaveLength(
      2,
    );
    expect(graph.warnings[0]).toContain("rate limit");
    expect(graph.inventoryIncomplete).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
