import { afterEach, it, expect, vi } from "vitest";
const { explain } = vi.hoisted(() => ({ explain: vi.fn() }));
vi.mock("../lib/explanation-service", () => ({ explainFile: explain }));
import { POST } from "../app/api/explain/route";
import { ExplanationError } from "../lib/explanation-input";
afterEach(() => vi.clearAllMocks());
function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}
it("rejects cross-origin requests and oversized bodies before invoking the provider", async () => {
  expect((await POST(request({}, "https://other.test"))).status).toBe(403);
  expect((await POST(request({ source: "x".repeat(768 * 1024) }))).status).toBe(
    400,
  );
  expect(explain).not.toHaveBeenCalled();
});
it("exposes only safe errors and no-store responses", async () => {
  explain.mockRejectedValueOnce(new Error("secret raw error"));
  const response = await POST(request({}));
  expect(await response.text()).not.toContain("secret raw error");
  expect(response.headers.get("cache-control")).toBe("no-store");
  explain.mockRejectedValueOnce(
    new ExplanationError("Set OPENAI_API_KEY", 503),
  );
  expect((await POST(request({}))).status).toBe(503);
});
