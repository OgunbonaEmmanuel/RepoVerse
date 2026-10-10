import { test, expect } from "@playwright/test";
import { analyze } from "../lib/analyze";
import {
  expressExplanation,
  expressExplanationSource,
  expressExplanationInput,
} from "../tests/fixtures/express-explanation";
import { sourceLines } from "../lib/source-lines";
import {
  explanationFixture,
  explanationInput,
  importUsageSource,
  importUsageExplanation,
} from "../tests/fixtures/explanation";
test("offline AI explanation disclosure, source references, retry and selection isolation", async ({
  page,
}) => {
  const graph = analyze(
    [
      { path: "src/greet.ts", source: explanationInput.source },
      { path: "src/other.ts", source: "export const other = 1;" },
    ],
    { name: "OFFLINE AI UI FIXTURE", commit: "fixture-v1", demo: true },
  );
  await page.route("**/api/demo", (route) => route.fulfill({ json: graph }));
  let calls = 0;
  // Always intercept this route: browser verification must never spend API credits.
  await page.route("**/api/explain", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.path).toBe("src/greet.ts");
    expect(body.source).toBe(explanationInput.source);
    if (calls === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: "Set OPENAI_API_KEY in .env.local and restart the server.",
        },
      });
    return route.fulfill({
      json: {
        explanation: explanationFixture,
        repository: graph.name,
        commit: graph.commit,
        path: "src/greet.ts",
        blobSha: "a".repeat(40),
        model: "MOCK PROVIDER — offline fixture",
        promptVersion: "fixture",
        suppliedLines: 3,
        totalLines: 3,
        truncated: false,
        dependenciesTruncated: false,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo" }).click();
  await expect(page.getByRole("heading", { name: graph.name })).toBeVisible();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Explain this file", exact: true })
    .click();
  await expect(page.getByText(/will be sent to OpenAI/)).toBeVisible();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Send selected source and explain" })
    .click();
  await expect(
    page.locator(".file-explanation").getByRole("alert"),
  ).toContainText("OPENAI_API_KEY");
  await page.getByRole("button", { name: "Retry explanation" }).click();
  await expect(page.getByText("Exports a greeting function.")).toBeVisible();
  await page
    .getByRole("button", { name: "Reveal source lines 1 to 2" })
    .first()
    .click();
  await expect(page.locator("mark")).toBeFocused();
  await expect(page.locator("mark")).toContainText("greet");
  await page.screenshot({ path: "test-results/file-explanation.png" });
  await page.getByLabel("Search files").fill("other.ts");
  await page.getByLabel("Search files").press("Enter");
  await expect(page.getByText("Exports a greeting function.")).toHaveCount(0);
  await expect(page.getByLabel("Source of src/other.ts")).toBeVisible();
  expect(calls).toBe(2);
});

test("Express evidence citations are spaced, exact and non-clickable when unverified", async ({
  page,
}) => {
  const graph = analyze(
    [
      { path: "lib/express.js", source: expressExplanationSource },
      { path: "other.ts", source: "export const other = 1;" },
    ],
    {
      name: "OFFLINE EXPRESS CITATION FIXTURE",
      commit: expressExplanationInput.commit,
      demo: true,
    },
  );
  const output = structuredClone(expressExplanation);
  output.symbols[1].references.push({
    start: 61,
    end: 63,
    excerpt: output.symbols[1].references[0].excerpt,
  });
  output.symbols[2].references.push({
    start: 900,
    end: 901,
    excerpt: "exports.Router = Router;",
  });
  await page.route("**/api/demo", (route) => route.fulfill({ json: graph }));
  let calls = 0;
  await page.route("**/api/explain", (route) => {
    calls++;
    expect(route.request().postDataJSON().source).toBe(
      expressExplanationSource,
    );
    return route.fulfill({
      json: {
        explanation: output,
        repository: graph.name,
        commit: graph.commit,
        path: "lib/express.js",
        blobSha: expressExplanationInput.blobSha,
        model: "MOCK PROVIDER - pinned Express fixture",
        promptVersion: "fixture-v3",
        suppliedLines: sourceLines(expressExplanationSource).length,
        totalLines: sourceLines(expressExplanationSource).length,
        truncated: false,
        dependenciesTruncated: false,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo" }).click();
  await page
    .getByRole("button", { name: "Select lib/express.js", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explain this file", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send selected source and explain" })
    .click();
  await expect(
    page.getByText(expressExplanation.purpose[0].text),
  ).toBeVisible();
  await expect(
    page.getByText("This claim has an unverified citation."),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Reveal source lines 61 to 63" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reveal source lines 900 to 901" }),
  ).toHaveCount(0);
  const buttons = page
    .locator(".source-references")
    .first()
    .getByRole("button");
  const a = await buttons.nth(0).boundingBox();
  const b = await buttons.nth(1).boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(b!.x >= a!.x + a!.width + 7 || b!.y >= a!.y + a!.height + 7).toBe(
    true,
  );
  for (const ref of [
    expressExplanation.purpose[0].references[1],
    ...expressExplanation.symbols.slice(1).map((item) => item.references[0]),
  ]) {
    await page
      .getByRole("button", {
        name: `Reveal source lines ${ref.start} to ${ref.end}`,
      })
      .first()
      .click();
    await expect(page.locator("mark")).toBeFocused();
    expect(await page.locator("mark").textContent()).toBe(ref.excerpt);
  }
  await page
    .locator(".explanation-result")
    .screenshot({ path: "test-results/express-citations.png" });
  await page
    .getByRole("button", { name: "Select other.ts", exact: true })
    .click();
  await expect(page.locator("mark")).toHaveCount(0);
  await expect(page.getByText(expressExplanation.purpose[0].text)).toHaveCount(
    0,
  );
  expect(calls).toBe(1);
});

test("concise import usage reveals call sites and keeps generic caveats collapsed", async ({
  page,
}) => {
  const graph = analyze(
    [
      { path: "label.ts", source: importUsageSource },
      {
        path: "format.ts",
        source: "export const format = (name: string) => name.trim();",
      },
    ],
    { name: "OFFLINE IMPORT USAGE FIXTURE", commit: "fixture-v2", demo: true },
  );
  await page.route("**/api/demo", (route) => route.fulfill({ json: graph }));
  let calls = 0;
  await page.route("**/api/explain", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.source).toBe(importUsageSource);
    expect(body.dependencies).toEqual([
      expect.objectContaining({
        specifier: "./format",
        to: "format.ts",
        line: 1,
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("name.trim()");
    return route.fulfill({
      json: {
        explanation: importUsageExplanation,
        repository: graph.name,
        commit: graph.commit,
        path: "label.ts",
        blobSha: "b".repeat(40),
        model: "MOCK PROVIDER - offline fixture",
        promptVersion: "fixture-v2",
        suppliedLines: 5,
        totalLines: 5,
        truncated: false,
        dependenciesTruncated: false,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo" }).click();
  await page
    .getByRole("button", { name: "Select label.ts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explain this file", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send selected source and explain" })
    .click();
  await expect(
    page.getByText(importUsageExplanation.imports[0].text),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What cannot be established" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Dependency implementations were not supplied/),
  ).toHaveCount(0);
  const note = page.locator(".explanation-result details");
  await expect(note).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Reveal source lines 3 to 4" })
    .click();
  await expect(page.locator("mark")).toBeFocused();
  await expect(page.locator("mark")).toHaveText(
    "  const title = format(user.name);\n  return title;",
  );
  await expect(page.locator("mark")).not.toContainText("import {");
  expect(calls).toBe(1);
});
