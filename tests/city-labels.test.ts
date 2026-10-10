import { describe, it, expect } from "vitest";
import {
  LabelCandidate,
  placeLabels,
  overlaps,
  MAX_DISTRICT_LABELS,
} from "../lib/city-labels";
const candidate = (
  id: string,
  overrides: Partial<LabelCandidate> = {},
): LabelCandidate => ({
  id,
  kind: "district",
  title: id,
  path: id,
  selected: false,
  hovered: false,
  x: 200,
  y: 200,
  distance: 10,
  offscreen: false,
  ...overrides,
});
describe("screen-space city labels", () => {
  it("keeps long building labels inside the view at all four edges", () => {
    for (const x of [-100, 1000])
      for (const y of [-100, 1000]) {
        const [label] = placeLabels(
          [
            candidate("file", {
              kind: "building",
              path: "src/" + "nested/".repeat(20) + "file.ts",
              selected: true,
              x,
              y,
            }),
          ],
          400,
          600,
        );
        expect(label.x).toBeGreaterThanOrEqual(8);
        expect(label.y).toBeGreaterThanOrEqual(8);
        expect(label.x + label.width).toBeLessThanOrEqual(392);
        expect(label.y + label.height).toBeLessThanOrEqual(538);
      }
  });
  it("prioritises building, hovered and selected district labels over distant labels", () => {
    const labels = placeLabels(
      [
        candidate("far"),
        candidate("selected", { selected: true }),
        candidate("hovered", { hovered: true }),
        candidate("file", { kind: "building", selected: true }),
      ],
      500,
      700,
    );
    expect(labels[0].id).toBe("file");
    expect(labels[1].id).toBe("hovered");
    expect(
      labels.every((a, i) => labels.slice(i + 1).every((b) => !overlaps(a, b))),
    ).toBe(true);
  });
  it("bounds district label DOM work independently of file/directory count", () => {
    const labels = placeLabels(
      Array.from({ length: 1000 }, (_, i) =>
        candidate(String(i), {
          x: (i % 10) * 210 + 100,
          y: Math.floor(i / 10) * 70 + 80,
          distance: i,
        }),
      ),
      2400,
      2000,
    );
    expect(labels).toHaveLength(MAX_DISTRICT_LABELS);
  });
  it("prioritises hovered and selected districts before the focused district", () => {
    const labels = placeLabels(
      [
        candidate("focused", { current: true }),
        candidate("selected", { selected: true }),
        candidate("hovered", { hovered: true }),
      ],
      500,
      700,
    );
    expect(labels.map((l) => l.id)).toEqual(["hovered", "selected", "focused"]);
  });
  it("suppresses lower-priority labels in a cramped viewport rather than overlapping", () => {
    const labels = placeLabels(
      [
        candidate("selected", { kind: "building", selected: true }),
        candidate("hovered", { kind: "building", hovered: true }),
        candidate("focused", { current: true }),
      ],
      220,
      180,
    );
    expect(labels.map((l) => l.id)).toEqual(["selected"]);
    expect(labels[0].y + labels[0].height).toBeLessThanOrEqual(90);
  });
  it("retains placement slots and ordering through small camera shifts and avoids buildings", () => {
    const input = [candidate("a"), candidate("b", { distance: 11 })];
    const bounds = [{ x: 160, y: 100, width: 80, height: 300 }];
    let previous = placeLabels(input, 600, 700, undefined, bounds);
    expect(previous.every((l) => !overlaps(l, bounds[0], 0))).toBe(true);
    const slots = previous.map((l) => [l.id, l.slot]);
    for (let i = 0; i < 20; i++) {
      previous = placeLabels(
        input.map((c) => ({
          ...c,
          x: c.x + i * 0.1,
          distance: c.id === "b" ? 9 : 10,
        })),
        600,
        700,
        undefined,
        bounds,
        previous,
      );
      expect(previous.map((l) => [l.id, l.slot])).toEqual(slots);
      expect(
        previous.every((a, index) =>
          previous.slice(index + 1).every((b) => !overlaps(a, b)),
        ),
      ).toBe(true);
    }
  });
});
