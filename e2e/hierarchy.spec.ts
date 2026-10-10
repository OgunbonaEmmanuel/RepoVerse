import { test, expect } from "@playwright/test";
test("nested district navigation, collapse, search reveal and exact visible dependency endpoints", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-building-count", "11");
  await expect(canvas).toHaveAttribute(
    "data-camera-target",
    JSON.stringify({ kind: "repository", id: "" }),
  );
  await page
    .getByRole("button", { name: "Focus folder src", exact: true })
    .click();
  const crumbs = page.getByRole("navigation", { name: "Folder breadcrumbs" });
  await expect(crumbs).toContainText("Repository");
  await expect(crumbs).toContainText("src");
  await page
    .getByRole("button", { name: "Focus folder src/ui", exact: true })
    .click();
  await expect(crumbs).toContainText("ui");
  await expect(
    page.locator('.district-label[data-current="true"]'),
  ).toHaveAttribute("data-path", "src/ui");
  await page
    .getByRole("button", { name: "Parent folder", exact: true })
    .click();
  await expect(
    crumbs.getByRole("button", { name: "src", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page
    .getByRole("button", { name: "Select src/main.ts", exact: true })
    .click();
  await expect
    .poll(async () =>
      JSON.parse((await canvas.getAttribute("data-visible-edges")) ?? "[]")
        .map((e: { to: string }) => e.to)
        .sort(),
    )
    .toEqual(["src/styles.css", "src/ui/App.tsx"]);
  await page
    .getByRole("button", { name: "Collapse folder src/ui", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-building-count", "10");
  await expect(
    page.locator('.district-label[data-path="src/ui"]'),
  ).toContainText("Collapsed");
  await expect(
    page.locator('.district-label[data-path="src/ui"]'),
  ).toContainText("1 descendant files");
  await expect
    .poll(async () =>
      JSON.parse((await canvas.getAttribute("data-visible-edges")) ?? "[]").map(
        (e: { to: string }) => e.to,
      ),
    )
    .toEqual(["src/styles.css"]);
  await expect(
    page.getByRole("button", { name: /→ src\/ui\/App.tsx/ }),
  ).toContainText("Hidden in collapsed src/ui");
  await page.getByRole("button", { name: /→ src\/ui\/App.tsx/ }).click();
  await expect(canvas).toHaveAttribute("data-building-count", "11");
  await expect(page.getByLabel("Source of src/ui/App.tsx")).toBeVisible();
  await page
    .getByRole("button", { name: "Full repository", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse folder src", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-building-count", "3");
  await expect(
    page.getByRole("button", { name: "Reveal selected file" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search files" })
    .fill("utils/format");
  await page.getByRole("textbox", { name: "Search files" }).press("Enter");
  await expect(canvas).toHaveAttribute("data-building-count", "11");
  await expect(
    page.locator('.building-label[data-selected="true"]'),
  ).toHaveAttribute("data-path", "src/utils/format.ts");
  await expect(crumbs).toContainText("utils");
  await page.getByRole("button", { name: "Imported by", exact: true }).click();
  await page
    .getByRole("button", { name: "Parent folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse folder src/data", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /← src\/data\/store.ts/ }),
  ).toContainText("Hidden in collapsed src/data");
  await expect
    .poll(async () =>
      JSON.parse((await canvas.getAttribute("data-visible-edges")) ?? "[]").map(
        (e: { from: string }) => e.from,
      ),
    )
    .toEqual(["src/ui/App.tsx"]);
  await page.getByRole("button", { name: /← src\/data\/store.ts/ }).click();
  await expect(page.getByLabel("Source of src/data/store.ts")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-building-count", "11");
  await page
    .getByRole("button", { name: "Full repository", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.mouse.move(5, 5);
  await expect(page.locator('.district-label[data-path="src"]')).toBeVisible();
  expect(
    await page
      .locator('.district-label[data-path=""] strong')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(
    page.locator('.district-label[data-path="src/ui"]'),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/nested-city.png" });
  expect(errors).toEqual([]);
});
