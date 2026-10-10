export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LabelCandidate {
  id: string;
  kind: "building" | "district";
  title: string;
  path: string;
  selected: boolean;
  hovered: boolean;
  x: number;
  y: number;
  distance: number;
  offscreen: boolean;
  current?: boolean;
  collapsed?: boolean;
  fileCount?: number;
  districtHeader?: boolean;
  level?: number;
  anchorX?: number;
  anchorY?: number;
}
export interface PlacedLabel extends LabelCandidate, LabelBox {
  slot: number;
  measureKey: string;
  maxHeight: number;
}
export const MAX_DISTRICT_LABELS = 8;
export function overlaps(a: LabelBox, b: LabelBox, gap = 6) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
function coveredArea(a: LabelBox, b: LabelBox) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
export function labelPriority(c: LabelCandidate) {
  if (c.kind === "building") return c.selected ? 0 : 1;
  if (c.hovered) return 2;
  if (c.selected) return 3;
  if (c.current) return 4;
  return c.collapsed ? 5 : 6 + (c.level ?? 0);
}
// CSS-pixel placement only. No building geometry or camera settings change here.
export function placeLabels(
  candidates: LabelCandidate[],
  width: number,
  height: number,
  sizes = new Map<string, { width: number; height: number }>(),
  buildingBounds: LabelBox[] = [],
  previous: PlacedLabel[] = [],
): PlacedLabel[] {
  const result: PlacedLabel[] = [];
  const maxHeight = height - 98;
  if (width < 56 || maxHeight < 38) return result;
  const old = new Map(previous.map((p, i) => [p.id, { label: p, order: i }]));
  let districts = 0;
  for (const c of [...candidates].sort(
    (a, b) =>
      labelPriority(a) - labelPriority(b) ||
      (old.get(a.id)?.order ?? Infinity) - (old.get(b.id)?.order ?? Infinity) ||
      a.distance - b.distance ||
      a.id.localeCompare(b.id),
  )) {
    if (c.kind === "district" && districts >= MAX_DISTRICT_LABELS) continue;
    const w = Math.min(
      c.kind === "building"
        ? Math.min(320, Math.max(190, c.path.length * 6.6 + 28))
        : c.hovered
          ? Math.min(280, Math.max(120, c.path.length * 7 + 24))
          : Math.min(190, Math.max(c.path ? 74 : 132, c.title.length * 8 + 30)),
      width - 16,
    );
    // Cache by all dimension-affecting state, including when a label is culled.
    const measureKey = JSON.stringify([
      c.id,
      c.title,
      c.path,
      w,
      c.hovered,
      c.selected,
      c.current,
      c.collapsed,
      c.fileCount,
      c.offscreen,
    ]);
    const pathLines = Math.ceil(
      c.path.length / Math.max(8, Math.floor((w - 24) / 7)),
    );
    const estimated =
      c.kind === "building"
        ? 64 + pathLines * 16
        : 38 +
          (c.hovered ? 3 + pathLines * 16 : 0) +
          (c.current || c.collapsed ? 18 : 0);
    const h = Math.min(maxHeight, sizes.get(measureKey)?.height ?? estimated);
    const clamp = (x: number, y: number): LabelBox => ({
      x: Math.max(8, Math.min(width - w - 8, x)),
      y: Math.max(8, Math.min(height - h - 90, y)),
      width: w,
      height: h,
    });
    const box = clamp(
      c.x - w / 2,
      c.districtHeader ? c.y - h / 2 : c.y - h - 24,
    );
    const positions = [
      box,
      clamp(box.x, box.y + h + 18),
      clamp(box.x, box.y - h - 18),
      clamp(box.x - w - 12, box.y),
      clamp(box.x + w + 12, box.y),
      clamp(box.x, box.y - 2 * (h + 12)),
      clamp(box.x, box.y + 2 * (h + 12)),
      clamp(box.x - w - 12, box.y - h - 12),
      clamp(box.x + w + 12, box.y - h - 12),
      clamp(box.x - w - 12, box.y + h + 12),
      clamp(box.x + w + 12, box.y + h + 12),
    ];
    const prior = old.get(c.id)?.label;
    // Re-entry needs extra clearance so labels don't toggle at the same threshold.
    const gap = prior ? 6 : 12;
    const viable = positions
      .map((p, slot) => ({ p, slot }))
      .filter(({ p }) => !result.some((r) => overlaps(p, r, gap)))
      .map(({ p, slot }) => ({
        p,
        slot,
        obstruction: buildingBounds.reduce(
          (sum, b) => sum + coveredArea(p, b),
          0,
        ),
      }));
    const retained = viable.find((p) => p.slot === prior?.slot);
    const best = viable.sort(
      (a, b) => a.obstruction - b.obstruction || a.slot - b.slot,
    )[0];
    // Keep a valid slot unless it obscures materially more building area.
    const chosen =
      retained && best && retained.obstruction <= best.obstruction + 160
        ? retained
        : best;
    if (!chosen) continue;
    result.push({
      ...c,
      anchorX: c.x,
      anchorY: c.y,
      ...chosen.p,
      slot: chosen.slot,
      measureKey,
      maxHeight,
    });
    if (c.kind === "district") districts++;
  }
  return result;
}
