import { test, expect } from "@playwright/test";
import { scaleGraph } from "../lib/scale";
import { cityLayout } from "../lib/layout";
import { demoGraph } from "../lib/demo";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraPose } from "../lib/city-camera";
test("real demo city, keyboard search, dependency links and fallback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("BUNDLED DEMO · OFFLINE FIXTURE")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-building-count",
    "11",
  );
  // Project an actual building using the same documented camera reset position,
  // then exercise R3F's real instance raycasting rather than a mocked renderer.
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.waitForTimeout(150);
  const layout = cityLayout(demoGraph().files);
  const target = layout.buildings.find((b) => b.id === "src/main.ts")!;
  const bounds = (await page.locator("canvas").boundingBox())!;
  const camera = new PerspectiveCamera(
    45,
    bounds.width / bounds.height,
    0.1,
    1000,
  );
  const pose = cameraPose(
    layout,
    { kind: "repository", id: "" },
    bounds.width / bounds.height,
  );
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const point = new Vector3(
    target.x,
    target.baseY + target.height - 0.05,
    target.z,
  ).project(camera);
  await page.locator("canvas").click({
    position: {
      x: ((point.x + 1) * bounds.width) / 2,
      y: ((1 - point.y) * bounds.height) / 2,
    },
  });
  await expect(page.getByLabel("Source of src/main.ts")).toBeVisible();
  await page
    .getByRole("button", { name: "Select src/main.ts", exact: true })
    .click();
  await expect(page.getByLabel("Source of src/main.ts")).toContainText(
    "import {App}",
  );
  await page.getByRole("button", { name: /→ src\/ui\/App.tsx/ }).click();
  await expect(page.getByLabel("Source of src/ui/App.tsx")).toBeVisible();
  await page.getByRole("button", { name: "Imported by", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /← src\/main.ts/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search files" })
    .fill("utils/format");
  await page.getByRole("textbox", { name: "Search files" }).press("Enter");
  await expect(page.getByLabel("Source of src/utils/format.ts")).toBeVisible();
  await page.getByRole("button", { name: "Focus file", exact: true }).click();
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /src\/utils\/format.ts Source code/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load demo", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search files" })).toHaveValue(
    "",
  );
  expect(errors).toEqual([]);
});
test("public GitHub import uses the live server and resets the demo", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Public GitHub repository URL" })
    .fill("https://github.com/octocat/Hello-World");
  await page.getByRole("button", { name: "Import repository ↗" }).click();
  await expect(page.getByText("PUBLIC GITHUB SNAPSHOT")).toBeVisible({
    timeout: 100000,
  });
  await expect(
    page.getByRole("heading", { name: "octocat/Hello-World", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select README", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Source of README")).toContainText(
    "Hello World",
  );
});
test("1000-file scene mounts and remains selectable", async ({ page }) => {
  const fixture = scaleGraph();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/import", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Public GitHub repository URL" })
    .fill("https://github.com/test/scale");
  const start = Date.now();
  await page.getByRole("button", { name: "Import repository ↗" }).click();
  await expect(
    page.getByRole("button", {
      name: "Select district-19/file-0999.ts",
      exact: true,
    }),
  ).toBeAttached();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-building-count",
    "1000",
  );
  console.log(
    `1000-file fixture DOM and canvas ready in ${Date.now() - start} ms (includes 500 ms settling; not an FPS measure)`,
  );
  await page.getByRole("textbox", { name: "Search files" }).fill("file-0999");
  const selectionStart = Date.now();
  await page.getByRole("textbox", { name: "Search files" }).press("Enter");
  await expect(
    page.getByLabel("Source of district-19/file-0999.ts"),
  ).toBeVisible();
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "district-19/file-0999.ts");
  console.log(
    `1000-file search selection and label ready in ${Date.now() - selectionStart} ms`,
  );
  expect(await page.locator(".building-label").count()).toBeLessThanOrEqual(2);
  expect(await page.locator(".district-label").count()).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/scale-scene.png" });
});
test("WebGL unavailable retains useful file navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return (original as (...args: unknown[]) => RenderingContext | null).call(
        this,
        type,
        ...args,
      );
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByText("City unavailable")).toBeVisible();
  await page
    .getByRole("button", { name: "Select src/main.ts", exact: true })
    .click();
  await expect(page.getByLabel("Source of src/main.ts")).toBeVisible();
});
