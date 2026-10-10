import { test, expect, Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { demoGraph } from "../lib/demo";
import { cityLayout } from "../lib/layout";
import { cameraPose } from "../lib/city-camera";
const layout = cityLayout(demoGraph().files);
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-building-count",
    "11",
  );
}
async function reset(page: Page) {
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.waitForTimeout(200);
}
async function point(
  page: Page,
  id: string,
  focused?: string,
  platform = false,
) {
  const b = layout.buildings.find((b) => b.id === id)!;
  const bounds = (await page.locator("canvas").boundingBox())!;
  const camera = new PerspectiveCamera(
    45,
    bounds.width / bounds.height,
    0.1,
    1000,
  );
  const pose = cameraPose(
    layout,
    { kind: focused ? "file" : "repository", id: focused ?? "" },
    bounds.width / bounds.height,
  );
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const district = layout.districts.find((d) => d.name === b.district)!;
  const p = (
    platform
      ? new Vector3(
          district.x + district.width / 2 - 0.3,
          district.elevation,
          district.z + district.depth / 2 - 0.3,
        )
      : new Vector3(b.x, b.baseY + b.height - 0.05, b.z)
  ).project(camera);
  return {
    x: bounds.x + ((p.x + 1) * bounds.width) / 2,
    y: bounds.y + ((1 - p.y) * bounds.height) / 2,
  };
}
async function containedLabels(page: Page) {
  await expect
    .poll(() =>
      page.locator(".city-label").evaluateAll((labels) => {
        const boxes = labels.map((l) => l.getBoundingClientRect());
        return boxes.every((a, i) =>
          boxes
            .slice(i + 1)
            .every(
              (b) =>
                a.right <= b.left ||
                b.right <= a.left ||
                a.bottom <= b.top ||
                b.bottom <= a.top,
            ),
        );
      }),
    )
    .toBe(true);
  const viewport = (await page.locator(".city-renderer").boundingBox())!;
  for (const label of await page.locator(".city-label").all()) {
    const box = (await label.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(viewport.x);
    expect(box.y).toBeGreaterThanOrEqual(viewport.y);
    expect(box.x + box.width).toBeLessThanOrEqual(
      viewport.x + viewport.width + 1,
    );
    expect(box.y + box.height).toBeLessThanOrEqual(
      viewport.y + viewport.height + 1,
    );
  }
}
test("hover names, persistent selection, pointer transparency and tree/search labels", async ({
  page,
}) => {
  await ready(page);
  await reset(page);
  const p = await point(page, "src/main.ts");
  await page.mouse.move(p.x, p.y);
  const main = page.locator('.building-label[data-path="src/main.ts"]');
  await expect(main).toBeVisible();
  await expect(main).toContainText("main.ts");
  await expect(main).toContainText("src/main.ts");
  await expect(main).toHaveAttribute("data-hovered", "true");
  expect(await main.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe(
    "none",
  );
  await page.mouse.click(p.x, p.y);
  await expect(main).toHaveAttribute("data-selected", "true");
  await page.mouse.move(5, 5);
  await expect(main).toBeVisible();
  const focused = await point(page, "src/main.ts", "src/main.ts");
  await page.mouse.move(focused.x, focused.y);
  await expect(main).toHaveAttribute("data-hovered", "true");
  await expect(main).toHaveCount(1);
  await page
    .getByRole("button", { name: "Select src/ui/App.tsx", exact: true })
    .click();
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "src/ui/App.tsx");
  await page
    .getByRole("textbox", { name: "Search files" })
    .fill("utils/format");
  await page.getByRole("textbox", { name: "Search files" }).press("Enter");
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "src/utils/format.ts");
  await page.mouse.move(5, 5);
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".building-label")).toHaveCount(0);
});
test("zoom, orbit, edge clamping and district paths", async ({ page }) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Select src/main.ts", exact: true })
    .click();
  await page.mouse.move(5, 5);
  const label = page.locator('.building-label[data-selected="true"]');
  const font = await label
    .locator("strong")
    .evaluate((el) => getComputedStyle(el).fontSize);
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await containedLabels(page);
  expect(
    await label
      .locator("strong")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe(font);
  for (let i = 0; i < 10; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await containedLabels(page);
  const canvas = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 20, canvas.y + 50, {
    steps: 12,
  });
  await page.mouse.up();
  await containedLabels(page);
  await reset(page);
  const p = await point(page, "src/main.ts");
  await page.mouse.move(p.x, p.y);
  await expect(
    page.locator('.district-label[data-hovered="true"]'),
  ).toContainText("src");
  expect(await page.locator(".district-label").count()).toBeLessThanOrEqual(8);
  await page.screenshot({ path: "test-results/city-labels.png" });
  // A nested district exposes its entire repository-relative directory path.
  await page
    .getByRole("button", { name: "Select src/ui/App.tsx", exact: true })
    .click();
  const nested = await point(page, "src/ui/App.tsx", "src/ui/App.tsx");
  await page.mouse.move(nested.x, nested.y);
  await expect(
    page.locator('.district-label[data-hovered="true"]'),
  ).toContainText("src/ui");
  await expect(
    page.locator('.district-label[data-path="src/ui"] strong'),
  ).toHaveText("▱ ui");
  const platform = await point(page, "src/ui/App.tsx", "src/ui/App.tsx", true);
  await page.mouse.move(platform.x, platform.y);
  await expect(
    page.locator('.district-label[data-hovered="true"]'),
  ).toHaveAttribute("data-path", "src/ui");
  await expect(
    page.locator('.building-label[data-hovered="true"]'),
  ).toHaveCount(0);
  await page.mouse.click(platform.x, platform.y);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-camera-target",
    JSON.stringify({ kind: "district", id: "src/ui" }),
  );
});

test("short folder labels remain stable at rest and selection survives camera motion", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Select src/ui/App.tsx", exact: true })
    .click();
  await page.mouse.move(5, 5);
  const folder = page.locator('.district-label[data-path="src/ui"]');
  await expect(folder.locator("strong")).toHaveText("▱ ui");
  await expect(folder.locator("span")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Folder breadcrumbs" }),
  ).toContainText("Repository → src → ui");
  const sample = async () => {
    await page.waitForTimeout(250);
    return page.evaluate(async () => {
      const frames: string[] = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        frames.push(
          JSON.stringify(
            Array.from(
              document.querySelectorAll<HTMLElement>(".city-label"),
            ).map((l) => [
              l.dataset.labelId,
              l.style.left,
              l.style.top,
              l.offsetWidth,
              l.offsetHeight,
            ]),
          ),
        );
      }
      return new Set(frames).size;
    });
  };
  expect(await sample()).toBe(1);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect(
      page.locator('.building-label[data-selected="true"]'),
    ).toHaveAttribute("data-path", "src/ui/App.tsx");
  }
  const canvas = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      canvas.x + canvas.width / 2 + i * 12,
      canvas.y + canvas.height / 2 - i * 5,
    );
    await expect(
      page.locator('.building-label[data-selected="true"]'),
    ).toHaveAttribute("data-path", "src/ui/App.tsx");
  }
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await containedLabels(page);
  expect(await sample()).toBe(1);
  // Hover expansion must also settle, rather than alternating measured sizes.
  await reset(page);
  const p = await point(page, "src/ui/App.tsx");
  await page.mouse.move(p.x, p.y);
  await expect(folder).toContainText("src/ui");
  expect(await sample()).toBe(1);
  await containedLabels(page);
  await page.screenshot({ path: "test-results/refined-labels.png" });
});
