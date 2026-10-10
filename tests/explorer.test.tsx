// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Explorer from "../components/Explorer";
import { demoGraph } from "../lib/demo";
import { analyze } from "../lib/analyze";
vi.mock("next/dynamic", () => ({
  default: () => () => <div>City renderer placeholder for DOM tests</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("explorer interactions", () => {
  it("shows accurate dependency states while retaining incoming navigation for unsupported targets", async () => {
    const graph = analyze(
      [
        { path: "a.ts", source: "import './data.csv';" },
        { path: "data.csv", source: "a,b" },
        { path: "empty.ts", source: "export {};" },
        { path: "external.ts", source: "import 'react'; import './missing';" },
        { path: "broken.ts", source: "const x =" },
      ],
      { name: "message fixture", commit: "test", demo: true },
    );
    const user = userEvent.setup();
    render(<Explorer initial={graph} />);
    await user.click(screen.getByRole("button", { name: "Select data.csv" }));
    expect(
      screen.getByText(
        "Dependency analysis is not supported for this file type.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No imports found.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Imported by" }));
    await user.click(screen.getByRole("button", { name: /← a.ts/ }));
    expect(screen.getByLabelText("Source of a.ts")).toBeTruthy();
    expect(
      screen.getByText("No incoming imports found among analysed files."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Imports$/ }));
    await user.click(screen.getByRole("button", { name: "Select empty.ts" }));
    expect(screen.getByText("No imports found.")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Select external.ts" }),
    );
    expect(screen.getByText(/Imports were detected/)).toBeTruthy();
    expect(screen.getByText(/External \/ bare specifier: react/)).toBeTruthy();
    expect(screen.getByText(/Unresolved: .\/missing/)).toBeTruthy();
    expect(screen.queryByText("No imports found.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Select broken.ts" }));
    expect(screen.getByText(/Dependency analysis is incomplete/)).toBeTruthy();
  });
  it("keeps search, tree, source and directed dependency navigation synchronized", async () => {
    const user = userEvent.setup();
    render(<Explorer initial={demoGraph()} />);
    await user.click(
      screen.getByRole("button", { name: "Select src/main.ts" }),
    );
    expect(
      screen.getByLabelText("Source of src/main.ts").textContent,
    ).toContain("import {App}");
    await user.click(
      screen.getByRole("button", { name: /→ src\/ui\/App.tsx/ }),
    );
    expect(screen.getByLabelText("Source of src/ui/App.tsx")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Imported by" }));
    expect(screen.getByRole("button", { name: /← src\/main.ts/ })).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "Search files" }),
      "utils/format{Enter}",
    );
    expect(screen.getByLabelText("Source of src/utils/format.ts")).toBeTruthy();
    const tree = screen.getByRole("navigation", { name: "Repository files" });
    expect(
      within(tree).getAllByRole("button", { name: /^Select / }),
    ).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(
      screen.getByRole("button", { name: /src\/utils\/format.ts Source code/ }),
    ).toBeTruthy();
  });
  it("resets selection and search on imports, preserves current graph on actionable errors", async () => {
    const user = userEvent.setup();
    const next = {
      ...demoGraph(),
      name: "owner/repo",
      demo: false,
      commit: "a".repeat(40),
      files: [{ ...demoGraph().files[0], id: "new.ts" }],
      imports: [],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => next })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: "GitHub rate limit reached. Retry later.",
          }),
        }),
    );
    render(<Explorer initial={demoGraph()} />);
    await user.type(
      screen.getByRole("textbox", { name: "Search files" }),
      "format",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Public GitHub repository URL" }),
      "https://github.com/owner/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Import repository ↗" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Source of new.ts")).toBeTruthy(),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Search files",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    await user.click(
      screen.getByRole("button", { name: "Import repository ↗" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("rate limit"),
    );
    expect(screen.getByLabelText("Source of new.ts")).toBeTruthy();
  });
});
