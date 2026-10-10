import { test, expect } from "@playwright/test";
import { expressFixture } from "../tests/fixtures/express";
import { retrySourceFile } from "../lib/file-recovery";
test("offline retry failure displays GitHub cooldown before allowing another action", async ({
  page,
}) => {
  const { graph, recoverFetcher } = await expressFixture();
  await page.route("**/api/import", (route) => route.fulfill({ json: graph }));
  let retries = 0;
  await page.route("**/api/retry-file", async (route) => {
    retries++;
    if (retries === 1)
      return route.fulfill({
        status: 429,
        json: {
          error: "GitHub rate limit reached; content was not downloaded.",
          failure: {
            kind: "rate-limit",
            message: "GitHub rate limit reached; content was not downloaded.",
            retryAt: Date.now() + 2000,
            httpStatus: 429,
            requestId: "offline-cooldown",
            attempts: 1,
            attempted: true,
          },
          retriesRemaining: 2,
        },
      });
    await route.fulfill({
      json: await retrySourceFile(route.request().postDataJSON(), {
        fetcher: recoverFetcher,
      }),
    });
  });
  await page.goto("/");
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/expressjs/express");
  await page.getByRole("button", { name: /Import repository/ }).click();
  await expect(
    page.getByRole("heading", { name: graph.name, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search files").fill("lib/express.js");
  await page.getByLabel("Search files").press("Enter");
  const retry = page.getByRole("button", {
    name: "Retry loading file",
    exact: true,
  });
  await retry.click();
  await expect(retry).toBeDisabled();
  await expect(page.locator(".details")).toContainText("offline-cooldown");
  await expect(page.locator(".details")).toContainText(
    "2 retry actions remaining",
  );
  await expect(page.locator(".dependency-message")).toContainText("rate limit");
  await expect(retry).toBeEnabled({ timeout: 5000 });
  await retry.click();
  await expect(page.getByLabel("Source of lib/express.js")).toBeVisible();
  expect(retries).toBe(2);
});
test("offline Express single-file retry keeps selection and updates direct dependency endpoints", async ({
  page,
}) => {
  const { graph, recoverFetcher, recoverRequests } = await expressFixture();
  let imports = 0,
    retries = 0;
  await page.route("**/api/import", (route) => {
    imports++;
    return route.fulfill({ json: graph });
  });
  await page.route("**/api/retry-file", async (route) => {
    retries++;
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      recoveryId: graph.recoveryId,
      commit: graph.commit,
      path: "lib/express.js",
    });
    await route.fulfill({
      json: await retrySourceFile(body, { fetcher: recoverFetcher }),
    });
  });
  await page.goto("/");
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/expressjs/express");
  await page.getByRole("button", { name: /Import repository/ }).click();
  await expect(
    page.getByRole("heading", { name: graph.name, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search files").fill("lib/express.js");
  await page.getByLabel("Search files").press("Enter");
  await expect(page.locator(".details")).toContainText("1,636 B");
  await expect(page.locator(".details")).toContainText(
    "GitHub returned HTTP 503",
  );
  await page.getByRole("button", { name: "Imported by", exact: true }).click();
  for (const path of [
    "examples/route-map/index.js",
    "examples/route-middleware/index.js",
  ])
    await expect(
      page
        .locator(".connections")
        .getByRole("button", { name: new RegExp(path) }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry loading file", exact: true })
    .click();
  await expect(page.getByLabel("Source of lib/express.js")).toBeVisible();
  await expect(page.getByLabel("Search files")).toHaveValue("lib/express.js");
  await expect(
    page.getByRole("button", { name: "Imported by", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "lib/express.js");
  await page.getByRole("button", { name: "Imports", exact: true }).click();
  for (const name of ["application", "request", "response"])
    await expect(
      page
        .locator(".connections")
        .getByRole("button", { name: new RegExp("lib/" + name + ".js") }),
    ).toBeVisible();
  await expect
    .poll(async () =>
      JSON.parse(
        (await page.locator("canvas").getAttribute("data-visible-edges")) ??
          "[]",
      )
        .map((e: { to: string }) => e.to)
        .sort(),
    )
    .toEqual(["lib/application.js", "lib/request.js", "lib/response.js"]);
  await page
    .locator(".connections")
    .getByRole("button", { name: /lib\/request.js/ })
    .click();
  await page.getByRole("button", { name: "Imported by", exact: true }).click();
  await expect(page.locator(".connections")).toContainText("lib/express.js");
  await expect(page.locator(".connections")).not.toContainText(
    "examples/route-map",
  );
  await page.getByLabel("Search files").fill("test-data/model.pkl");
  await page.getByLabel("Search files").press("Enter");
  await expect(
    page.getByRole("button", { name: "Retry loading file", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".content-status")).toContainText(
    "Binary preview unavailable",
  );
  expect(imports).toBe(1);
  expect(retries).toBe(1);
  expect(recoverRequests).toHaveLength(1);
});
