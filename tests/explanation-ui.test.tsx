// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Explorer from "../components/Explorer";
import FileExplanation from "../components/FileExplanation";
import { analyze } from "../lib/analyze";
import { explanationFixture, explanationInput } from "./fixtures/explanation";
vi.mock("next/dynamic", () => ({
  default: () => () => <div>City placeholder</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const graph = () =>
  analyze(
    [
      { path: "a.ts", source: explanationInput.source },
      { path: "b.ts", source: "export const b = 2;" },
    ],
    {
      name: explanationInput.repository,
      commit: explanationInput.commit,
      demo: true,
    },
  );
const result = () => ({
  explanation: explanationFixture,
  repository: explanationInput.repository,
  commit: explanationInput.commit,
  path: "a.ts",
  blobSha: "a".repeat(40),
  model: "fixture-model",
  promptVersion: "fixture",
  suppliedLines: 3,
  totalLines: 3,
  truncated: false,
});
it("requires disclosure and an explicit send, validates output, and focuses source references", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result() });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<Explorer initial={graph()} />);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Explain this file" }));
  expect(screen.getByText(/will be sent to OpenAI/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Send selected source and explain" }),
  );
  await screen.findByText("Exports a greeting function.");
  const sent = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(sent.path).toBe("a.ts");
  expect(sent.source).toBe(explanationInput.source);
  expect(sent).not.toHaveProperty("files");
  await user.click(
    screen.getAllByRole("button", { name: "Reveal source lines 1 to 2" })[0],
  );
  expect(document.activeElement?.tagName).toBe("MARK");
  expect(screen.getByLabelText("Source lines 1 to 2").textContent).toContain(
    "greet",
  );
});
it.each(["file", "repository"])(
  "discards a delayed explanation after changing %s",
  async (change) => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<Explorer initial={graph()} />);
    await user.click(screen.getByRole("button", { name: "Explain this file" }));
    await user.click(
      screen.getByRole("button", { name: "Send selected source and explain" }),
    );
    if (change === "file")
      await user.click(screen.getByRole("button", { name: "Select b.ts" }));
    else {
      fetcher.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...graph(), name: "other/repository" }),
      });
      await user.click(screen.getByRole("button", { name: "Load demo" }));
      await screen.findByRole("heading", { name: "other/repository" });
    }
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    finish({ ok: true, json: async () => result() });
    await waitFor(() =>
      expect(screen.queryByText("Exports a greeting function.")).toBeNull(),
    );
  },
);
it("shows a helpful setup error and permits retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Set OPENAI_API_KEY in .env.local and restart the server.",
      }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => result() });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<Explorer initial={graph()} />);
  await user.click(screen.getByRole("button", { name: "Explain this file" }));
  await user.click(
    screen.getByRole("button", { name: "Send selected source and explain" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "OPENAI_API_KEY",
  );
  await user.click(screen.getByRole("button", { name: "Retry explanation" }));
  await screen.findByText("Exports a greeting function.");
});

it.each(["commit", "blob", "source"])(
  "discards in-flight citations when the selected snapshot changes: %s",
  async (change) => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    const original = graph();
    const file = original.files.find((file) => file.id === "a.ts")!;
    const { rerender } = render(
      <FileExplanation file={file} graph={original} />,
    );
    await user.click(screen.getByRole("button", { name: "Explain this file" }));
    await user.click(
      screen.getByRole("button", { name: "Send selected source and explain" }),
    );
    rerender(
      <FileExplanation
        file={{
          ...file,
          ...(change === "blob" ? { blobSha: "b".repeat(40) } : {}),
          ...(change === "source"
            ? { source: "// inserted\n" + file.source }
            : {}),
        }}
        graph={{
          ...original,
          ...(change === "commit" ? { commit: "new-commit" } : {}),
        }}
      />,
    );
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    finish({ ok: true, json: async () => result() });
    await waitFor(() =>
      expect(screen.queryByText("Exports a greeting function.")).toBeNull(),
    );
    expect(
      screen.queryByRole("button", { name: "Reveal source lines 1 to 2" }),
    ).toBeNull();
  },
);
