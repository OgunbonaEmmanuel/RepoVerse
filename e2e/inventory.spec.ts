import { test, expect } from "@playwright/test";
import { inventoryFixture } from "../tests/fixtures/inventory";
import { colors } from "../lib/file-types";
import { importGitHub } from "../lib/github";
import { cityLayout } from "../lib/layout";

test("offline metadata inventory: search, categories, selection, LFS and dependency targets", async ({
  page,
}) => {
  const { graph } = await inventoryFixture();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route("**/api/import", (route) => route.fulfill({ json: graph }));
  await page.goto("/");
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/fixture/movie-inventory");
  await page.getByRole("button", { name: "Import repository ↗" }).click();
  await expect(
    page.getByRole("heading", { name: graph.name, exact: true }),
  ).toBeVisible();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-building-count", "14");
  await expect(canvas).toHaveAttribute("data-metadata-building-count", "10");
  for (const file of graph.files) {
    const button = page.getByRole("button", {
      name: `Select ${file.id}`,
      exact: true,
    });
    await expect(button).toHaveAttribute("data-category", file.category);
    const colour = colors[file.category];
    const rgb = `rgb(${parseInt(colour.slice(1, 3), 16)}, ${parseInt(colour.slice(3, 5), 16)}, ${parseInt(colour.slice(5, 7), 16)})`;
    await expect(button.locator("span")).toHaveCSS("color", rgb);
  }
  for (const category of Object.keys(colors))
    await expect(
      page.locator(".legend").getByText(category, { exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Select data/movies.csv", exact: true })
    .click();
  await expect(page.locator(".content-status")).toHaveText(
    "Contents not loaded",
  );
  await expect(page.locator(".details")).toContainText("1,200 B");
  await expect(page.getByLabel("Source of data/movies.csv")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View file on GitHub ↗" }),
  ).toHaveAttribute("href", /\/data\/movies.csv$/);
  await page.getByRole("button", { name: "Imported by", exact: true }).click();
  await page.getByRole("button", { name: /← src\/main.ts/ }).click();
  await expect(page.getByLabel("Source of src/main.ts")).toBeVisible();
  await page.getByRole("button", { name: "Imports", exact: true }).click();
  await expect
    .poll(async () =>
      JSON.parse((await canvas.getAttribute("data-visible-edges")) ?? "[]")
        .map((e: { to: string }) => e.to)
        .sort(),
    )
    .toEqual(["data/movies.csv", "models/movie_list.pkl", "src/helper.ts"]);
  await page.getByRole("button", { name: /→ models\/movie_list.pkl/ }).click();
  await expect(page.locator(".content-status")).toHaveText(
    "Binary preview unavailable",
  );
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "models/movie_list.pkl");
  await page.getByLabel("Search files").fill("similarity.pkl");
  await page.getByLabel("Search files").press("Enter");
  await expect(page.locator(".content-status")).toHaveText(
    "Exceeds preview limit",
  );
  await expect(page.locator(".details")).toContainText("80,000,000 B");
  await page.getByLabel("Search files").fill("assets/lfs");
  await page.getByLabel("Search files").press("Enter");
  await expect(page.locator(".content-status")).toContainText(
    "Git LFS pointer",
  );
  await expect(page.locator(".details")).toContainText("123,456,789 B");
  await expect(page.getByLabel("Source of assets/lfs.txt")).toHaveCount(0);
  await page.getByLabel("Search files").fill("");
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.screenshot({ path: "test-results/metadata-inventory.png" });
  expect(
    requests.filter((url) => /github\.com.*(?:blobs|raw)/.test(url)),
  ).toEqual([]);
});

test("public GitHub movie inventory preserves CSV and PKL without blob downloads", async ({
  page,
}) => {
  test.setTimeout(120000);
  const requests: string[] = [];
  let entries: { path: string; type: string; sha: string }[] = [];
  const graph = await importGitHub(
    "https://github.com/OgunbonaEmmanuel/movie-recommendation",
    {
      fetcher: async (input, init) => {
        requests.push(String(input));
        const response = await fetch(input, init);
        if (String(input).includes("/git/trees/") && response.ok)
          entries = (await response.clone().json()).tree;
        return response;
      },
    },
  );
  const assets = entries.filter((e) => /\.(csv|pkl)$/i.test(e.path));
  expect(assets.length).toBeGreaterThanOrEqual(5);
  const layout = cityLayout(graph.files);
  for (const entry of assets) {
    expect(requests.some((r) => r.endsWith(`/git/blobs/${entry.sha}`))).toBe(
      false,
    );
    const file = graph.files.find((f) => f.id === entry.path)!;
    expect(file.source).toBeNull();
    expect(file.lines).toBeNull();
    expect(layout.buildings.find((b) => b.id === entry.path)?.district).toBe(
      entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/"))
        : "",
    );
  }
  console.log(
    JSON.stringify({
      liveRepository: graph.name,
      commit: graph.commit,
      inventoryFiles: graph.files.length,
      inventoryIncomplete: graph.inventoryIncomplete,
      previewFiles: graph.files
        .filter((f) => f.source !== null)
        .map((f) => f.id),
      csvPkl: assets.map((e) => e.path),
      blobRequests: requests.filter((r) => r.includes("/git/blobs/")).length,
    }),
  );
  // Recheck the normal server endpoint and browser flow without intercepting it.
  await page.goto("/");
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/OgunbonaEmmanuel/movie-recommendation");
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/import"),
    { timeout: 100000 },
  );
  await page.getByRole("button", { name: "Import repository ↗" }).click();
  const serverResponse = await responsePromise;
  expect(serverResponse.ok()).toBe(true);
  const serverGraph = await serverResponse.json();
  expect(serverGraph.commit).toBe(graph.commit);
  expect(serverGraph.files.map((f: { id: string }) => f.id)).toEqual(
    graph.files.map((f) => f.id),
  );
  for (const entry of assets)
    expect(
      serverGraph.files.find((f: { id: string }) => f.id === entry.path).source,
    ).toBeNull();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-building-count",
    String(graph.files.length),
  );
  for (const entry of assets) {
    await page.getByLabel("Search files").fill(entry.path);
    await page.getByLabel("Search files").press("Enter");
    await expect(page.locator(".details .file-path")).toHaveText(entry.path);
    await expect(
      page.locator('.building-label[data-selected="true"]'),
    ).toHaveAttribute("data-path", entry.path);
    await expect(page.getByLabel(`Source of ${entry.path}`)).toHaveCount(0);
  }
  await page.getByLabel("Search files").fill("");
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.screenshot({ path: "test-results/live-movie-inventory.png" });
});
