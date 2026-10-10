import { afterEach, it, expect, vi } from "vitest";
import { POST } from "../app/api/retry-file/route";
import { expressFixture } from "./fixtures/express";
afterEach(() => vi.unstubAllGlobals());
const request = (body: unknown) =>
  new Request("http://localhost/api/retry-file", {
    method: "POST",
    body: JSON.stringify(body),
  });
it("the retry route uses the registered snapshot and returns parsed source", async () => {
  const { graph, recoverFetcher, recoverRequests } = await expressFixture();
  vi.stubGlobal("fetch", recoverFetcher);
  const response = await POST(
    request({
      recoveryId: graph.recoveryId,
      commit: graph.commit,
      path: "lib/express.js",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result.file.status).toBe("parsed");
  expect(
    result.imports.filter((e: { kind: string }) => e.kind === "internal"),
  ).toHaveLength(3);
  expect(recoverRequests).toHaveLength(1);
});
it("the route returns structured cooldown diagnostics and no network request", async () => {
  const { graph } = await expressFixture(
    new Response("", { status: 429, headers: { "retry-after": "60" } }),
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(
    request({
      recoveryId: graph.recoveryId,
      commit: graph.commit,
      path: "lib/express.js",
    }),
  );
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await response.json()).failure.kind).toBe("rate-limit");
  expect(fetcher).not.toHaveBeenCalled();
});
it("the route rejects unknown snapshots and oversized request bodies", async () => {
  expect(
    (
      await POST(
        request({ recoveryId: "missing", commit: "a", path: "lib/express.js" }),
      )
    ).status,
  ).toBe(410);
  expect((await POST(request({ path: "x".repeat(8193) }))).status).toBe(413);
});
