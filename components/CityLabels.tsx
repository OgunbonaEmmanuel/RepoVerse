import { useFrame, useThree } from "@react-three/fiber";
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { Building, VisibleCity } from "../lib/layout";
import {
  LabelBox,
  LabelCandidate,
  PlacedLabel,
  placeLabels,
} from "../lib/city-labels";

export function LabelOverlay({
  labels,
  overlay,
}: {
  labels: PlacedLabel[];
  overlay: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="city-label-layer" ref={overlay} aria-label="City labels">
      <svg className="district-label-guides" aria-hidden="true">
        {labels
          .filter((l) => l.kind === "district" && !l.offscreen)
          .map((l) => (
            <g key={l.id}>
              <line
                x1={Math.max(l.x, Math.min(l.x + l.width, l.anchorX ?? l.x))}
                y1={Math.max(l.y, Math.min(l.y + l.height, l.anchorY ?? l.y))}
                x2={l.anchorX}
                y2={l.anchorY}
              />
              <circle cx={l.anchorX} cy={l.anchorY} r={2} />
            </g>
          ))}
      </svg>
      {labels.map((label) => (
        <div
          key={label.id}
          data-label-id={label.id}
          data-measure-key={label.measureKey}
          data-path={label.path}
          data-selected={label.selected}
          data-hovered={label.hovered}
          data-kind={label.kind}
          data-collapsed={label.collapsed}
          data-current={label.current}
          className={`city-label ${label.kind}-label ${label.selected ? "is-selected" : ""} ${label.hovered ? "is-hovered" : ""}`}
          style={{
            left: label.x,
            top: label.y,
            width: label.width,
            maxHeight: label.maxHeight,
          }}
        >
          <strong>
            {label.kind === "district" ? "▱ " : ""}
            {label.title}
          </strong>
          {(label.kind === "building" || label.hovered) && (
            <span>{label.path}</span>
          )}
          {label.kind === "building" && (
            <small>
              {label.selected ? "Selected file" : "Hover to inspect"}
              {label.offscreen ? " · outside view" : ""}
            </small>
          )}
          {label.kind === "district" && (label.collapsed || label.current) && (
            <small>
              {label.collapsed
                ? `Collapsed · ${label.fileCount} descendant files`
                : `${label.fileCount} files`}
            </small>
          )}
        </div>
      ))}
    </div>
  );
}

export function LabelProjector({
  layout,
  selected,
  hovered,
  hoveredDistrict,
  overlay,
  onLabels,
  currentFolder,
  collapsed,
}: {
  layout: VisibleCity;
  selected: string;
  hovered: string;
  hoveredDistrict: string | null;
  currentFolder: string;
  collapsed: ReadonlySet<string>;
  overlay: RefObject<HTMLDivElement | null>;
  onLabels: (labels: PlacedLabel[]) => void;
}) {
  const { invalidate } = useThree();
  const previous = useRef("");
  const previousLabels = useRef<PlacedLabel[]>([]);
  const measurements = useRef(
    new Map<string, { width: number; height: number }>(),
  );
  const lastCamera = useRef("");
  const movingUntil = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  useEffect(() => {
    measurements.current.clear();
    previousLabels.current = [];
  }, [layout]);
  const buildings = useMemo(
    () => new Map(layout.buildings.map((b) => [b.id, b])),
    [layout],
  );
  useLayoutEffect(() => {
    invalidate();
  });
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const cameraKey = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      size.width,
      size.height,
    ].join(",");
    if (lastCamera.current && cameraKey !== lastCamera.current) {
      movingUntil.current = performance.now() + 120;
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(invalidate, 130);
    }
    lastCamera.current = cameraKey;
    const moving = performance.now() < movingUntil.current;
    const candidates: LabelCandidate[] = [];
    const bounds: LabelBox[] = [];
    const project = (x: number, y: number, z: number) => {
      const world = new Vector3(x, y, z);
      const distance = world.distanceToSquared(camera.position);
      const point = world.project(camera);
      return {
        x: ((point.x + 1) * size.width) / 2,
        y: ((1 - point.y) * size.height) / 2,
        distance,
        offscreen:
          Math.abs(point.x) > 1 ||
          Math.abs(point.y) > 1 ||
          point.z < -1 ||
          point.z > 1,
        behind: point.z > 1 || point.z < -1,
      };
    };
    // All visible buildings influence obstruction scores; no additional HTML mounts.
    for (const b of layout.buildings) {
      const corners = [-0.6, 0.6].flatMap((x) =>
        [-0.6, 0.6].flatMap((z) =>
          [b.baseY, b.baseY + b.height].map((y) =>
            project(b.x + x, y, b.z + z),
          ),
        ),
      );
      if (corners.every((c) => !c.behind)) {
        const x = Math.min(...corners.map((c) => c.x)),
          y = Math.min(...corners.map((c) => c.y));
        bounds.push({
          x,
          y,
          width: Math.max(...corners.map((c) => c.x)) - x,
          height: Math.max(...corners.map((c) => c.y)) - y,
        });
      }
    }
    const addBuilding = (b: Building, isSelected: boolean) => {
      const p = project(b.x, b.baseY + b.height + 0.3, b.z);
      candidates.push({
        id: `building:${b.id}`,
        kind: "building",
        title: b.id.split("/").pop()!,
        path: b.id,
        selected: isSelected,
        hovered: hovered === b.id,
        ...p,
        ...(p.behind ? { x: size.width / 2, y: 90 } : {}),
      });
    };
    const selectedBuilding = buildings.get(selected),
      hoveredBuilding = buildings.get(hovered);
    if (selectedBuilding) addBuilding(selectedBuilding, true);
    if (hoveredBuilding && hovered !== selected)
      addBuilding(hoveredBuilding, false);
    for (const d of layout.districts) {
      const p = project(d.labelX, d.elevation + 0.5, d.labelZ);
      const isHovered =
          d.name === (hoveredBuilding?.district ?? hoveredDistrict),
        isSelected = d.name === selectedBuilding?.district;
      const current = d.name === currentFolder;
      if (
        moving &&
        !isHovered &&
        !isSelected &&
        !current &&
        !previousLabels.current.some((l) => l.id === `district:${d.name}`)
      )
        continue;
      if (p.behind || (p.offscreen && !isHovered && !isSelected && !current))
        continue;
      candidates.push({
        id: `district:${d.name}`,
        kind: "district",
        title: d.name ? d.name.split("/").pop()! : "Repository",
        path: d.name,
        current,
        collapsed: collapsed.has(d.name),
        fileCount: d.fileCount,
        districtHeader: true,
        level: d.level,
        selected: isSelected,
        hovered: isHovered,
        ...p,
      });
    }
    const sizes = measurements.current;
    if (sizes.size > 256) sizes.clear();
    overlay.current
      ?.querySelectorAll<HTMLElement>("[data-label-id]")
      .forEach((el) =>
        sizes.set(el.dataset.measureKey!, {
          width: el.offsetWidth,
          height: el.offsetHeight,
        }),
      );
    const labels = placeLabels(
      candidates,
      size.width,
      size.height,
      sizes,
      bounds,
      previousLabels.current,
    ).map((l) => ({ ...l, x: Math.round(l.x), y: Math.round(l.y) }));
    previousLabels.current = labels;
    const signature = JSON.stringify(labels);
    if (signature !== previous.current) {
      previous.current = signature;
      onLabels(labels);
    }
  });
  return null;
}
