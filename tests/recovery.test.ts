import { describe, it, expect, vi } from "vitest";
import {
  expressFixture,
  expressBlobs,
  expressSources,
} from "./fixtures/express";
import { registerRecovery, retrySourceFile } from "../lib/file-recovery";
import { LIMITS } from "../lib/model";
import { applyFileRecovery } from "../lib/apply-recovery";
import { connected } from "../lib/model";
import { createGitHubClient, retryTime } from "../lib/github-client";
import { dependencyMessage } from "../lib/dependency-message";

const request = (
  graph: Awaited<ReturnType<typeof expressFixture>>["graph"],
  path = "lib/express.js",
) => ({ recoveryId: graph.recoveryId, commit: graph.commit, path });
describe("commit-pinned single-file recovery", () => {
  it("shares the original content budget across successful recoveries", async () => {
    const { graph, recoverFetcher, recoverRequests } = await expressFixture();
    registerRecovery(
      graph,
      "expressjs",
      "express",
      expressBlobs,
      LIMITS.total - 1636,
      LIMITS,
    );
    await retrySourceFile(request(graph), { fetcher: recoverFetcher });
    await expect(
      retrySourceFile(request(graph, "lib/request.js"), {
        fetcher: recoverFetcher,
      }),
    ).rejects.toMatchObject({
      status: 413,
      failure: { kind: "size-limit", attempted: false },
    });
    expect(recoverRequests).toHaveLength(1);
  });
  it("records the real failure, distinguishes skipped requests, and preserves metadata", async () => {
    const { graph, requests } = await expressFixture(
      new Response("", {
        status: 429,
        headers: {
          "retry-after": "60",
          "x-github-request-id": "fixture-request",
        },
      }),
    );
    const file = graph.files.find((f) => f.id === "lib/express.js")!;
    expect(file.bytes).toBe(1636);
    expect(file.failure).toMatchObject({
      kind: "rate-limit",
      attempted: true,
      httpStatus: 429,
      requestId: "fixture-request",
    });
    expect(dependencyMessage(file, "outgoing", graph.imports)).toContain(
      "rate limit",
    );
    expect(
      graph.files.find((f) => f.id === "lib/request.js")?.failure,
    ).toMatchObject({
      attempted: false,
      blockedBy: "lib/express.js",
      attempts: 0,
    });
    expect(requests).not.toContain(
      expect.stringContaining(expressBlobs.get("lib/request.js")!),
    );
    const fetcher = vi.fn<typeof fetch>();
    await expect(retrySourceFile(request(graph), { fetcher })).rejects.toThrow(
      "cooldown",
    );
    for (const path of ["test-data/model.pkl", "test-data/huge.js"]) {
      await expect(
        retrySourceFile(request(graph, path), { fetcher }),
      ).rejects.toThrow("preview-eligible");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("loads only the original blob, resolves the three relative requires and preserves direct incoming edges", async () => {
    const { graph, recoverFetcher, recoverRequests } = await expressFixture();
    const incoming = connected(graph, "lib/express.js", "incoming");
    expect(incoming.map((e) => [e.from, e.specifier, e.line])).toEqual([
      ["examples/route-map/index.js", "../../lib/express", 8],
      ["examples/route-middleware/index.js", "../../lib/express", 7],
    ]);
    const result = await retrySourceFile(request(graph), {
      fetcher: recoverFetcher,
    });
    const next = applyFileRecovery(graph, result);
    expect(next.files.find((f) => f.id === "lib/express.js")?.source).toBe(
      expressSources.get("lib/express.js"),
    );
    expect(
      connected(next, "lib/express.js", "outgoing").map((e) => [e.to, e.line]),
    ).toEqual([
      ["lib/application.js", 18],
      ["lib/request.js", 20],
      ["lib/response.js", 21],
    ]);
    expect(connected(next, "lib/express.js", "incoming")).toEqual(incoming);
    expect(
      connected(next, "lib/request.js", "incoming").some((e) =>
        e.from.startsWith("examples/"),
      ),
    ).toBe(false);
    expect(
      connected(next, "lib/request.js", "incoming").some(
        (e) => e.from === "lib/express.js",
      ),
    ).toBe(true);
    expect(recoverRequests).toEqual([
      `https://api.github.com/repos/expressjs/express/git/blobs/${expressBlobs.get("lib/express.js")}`,
    ]);
    expect(
      await retrySourceFile(request(graph), { fetcher: recoverFetcher }),
    ).toEqual(result);
    expect(recoverRequests).toHaveLength(1);
    expect(applyFileRecovery(next, result).imports).toEqual(next.imports);
    expect(
      applyFileRecovery({ ...graph, commit: "different" }, result).files,
    ).toBe(graph.files);
    await expect(
      retrySourceFile({ ...request(graph), commit: "different" }),
    ).rejects.toThrow("does not match");
  });
  it("bounds manual actions and each action's automatic retries", async () => {
    const { graph } = await expressFixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("", { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    for (let i = 0; i < 3; i++)
      await expect(
        retrySourceFile(request(graph), { fetcher, sleep }),
      ).rejects.toMatchObject({
        retriesRemaining: 2 - i,
        failure: { attempts: 2, httpStatus: 503 },
      });
    await expect(
      retrySourceFile(request(graph), { fetcher, sleep }),
    ).rejects.toThrow("three-action");
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
describe("GitHub failure diagnostics and retry instructions", () => {
  it("honours both Retry-After formats, primary reset and secondary fallback", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(retryTime(new Headers({ "retry-after": "10" }), now, true)).toBe(
      now + 10100,
    );
    expect(
      retryTime(
        new Headers({ "retry-after": "Thu, 01 Jan 2026 00:00:20 GMT" }),
        now,
        true,
      ),
    ).toBe(now + 20100);
    expect(
      retryTime(
        new Headers({
          "retry-after": "1",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(now / 1000 + 30),
        }),
        now,
        true,
      ),
    ).toBe(now + 30100);
    expect(retryTime(new Headers(), now, true)).toBe(now + 60000);
  });
  it("does not retry before a long server cooldown; shares the pause between requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response("API rate limit exceeded", {
          status: 403,
          headers: { "retry-after": "60", "x-ratelimit-remaining": "0" },
        }),
    );
    const api = createGitHubClient("a", "b", { fetcher, maxAttempts: 2 });
    await expect(api("")).rejects.toMatchObject({
      failure: { kind: "rate-limit", httpStatus: 403, attempts: 1 },
    });
    await expect(api("")).rejects.toMatchObject({
      failure: { attempted: false },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("waits for a short Retry-After before its bounded second attempt", async () => {
    let now = 10000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    expect(
      await createGitHubClient("a", "b", {
        fetcher,
        maxAttempts: 2,
        now: () => now,
        sleep,
      })(""),
    ).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(1100, undefined);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("distinguishes timeout, caller cancellation, denied access and network failures", async () => {
    const stalled: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    await expect(
      createGitHubClient("a", "b", { fetcher: stalled, requestTimeoutMs: 5 })(
        "",
      ),
    ).rejects.toMatchObject({ failure: { kind: "timeout" } });
    const controller = new AbortController();
    const pending = createGitHubClient("a", "b", {
      fetcher: stalled,
      signal: controller.signal,
    })("");
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      failure: { kind: "cancelled" },
    });
    await expect(
      createGitHubClient("a", "b", {
        fetcher: async () => new Response("", { status: 403 }),
      })(""),
    ).rejects.toMatchObject({ failure: { kind: "http", httpStatus: 403 } });
    await expect(
      createGitHubClient("a", "b", {
        fetcher: async () => {
          throw new TypeError("offline");
        },
      })(""),
    ).rejects.toMatchObject({ failure: { kind: "network" } });
  });
});
