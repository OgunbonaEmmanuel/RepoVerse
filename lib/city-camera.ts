import { CityLayout, District } from "./layout";
export interface CameraTarget {
  kind: "repository" | "district" | "file";
  id: string;
}
export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  far: number;
}
/** Solve the distance for the eight bounding-box corners in camera space.
 * The steeper overview exposes nested borders; margins leave room for controls. */
export function cameraPose(
  layout: CityLayout,
  request: CameraTarget,
  aspect: number,
): CameraPose {
  const file =
    request.kind === "file"
      ? layout.buildings.find((b) => b.id === request.id)
      : undefined;
  if (file)
    return {
      position: [file.x + 9, file.baseY + file.height + 10, file.z + 10],
      target: [file.x, file.baseY + file.height / 2, file.z],
      far: Math.max(1000, layout.extent * 10),
    };
  const district: District =
    layout.districts.find(
      (d) => d.name === (request.kind === "district" ? request.id : ""),
    ) ?? layout.districts[0];
  const members = layout.buildings.filter(
    (b) =>
      !district.name ||
      b.district === district.name ||
      b.district.startsWith(district.name + "/"),
  );
  const top = Math.max(
    district.elevation + 1,
    ...members.map((b) => b.baseY + b.height),
  );
  const target: [number, number, number] = [
    district.x,
    (top + district.elevation) / 2,
    district.z,
  ];
  type Vec = [number, number, number];
  const normalize = (v: Vec): Vec => {
    const length = Math.hypot(...v);
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const direction = normalize([0.5, 1.3, 0.75]);
  const right = normalize([direction[2], 0, -direction[0]]);
  const up: Vec = [
    direction[1] * right[2],
    direction[2] * right[0] - direction[0] * right[2],
    -direction[1] * right[0],
  ];
  const tangent = Math.tan(Math.PI / 8);
  let distance = 1;
  for (const x of [-district.width / 2, district.width / 2])
    for (const y of [
      -(top - district.elevation) / 2,
      (top - district.elevation) / 2,
    ])
      for (const z of [-district.depth / 2, district.depth / 2]) {
        const corner: Vec = [x, y, z];
        distance = Math.max(
          distance,
          dot(corner, direction) +
            Math.max(
              Math.abs(dot(corner, right)) /
                (tangent * Math.max(0.1, aspect) * 0.86),
              Math.abs(dot(corner, up)) / (tangent * 0.8),
            ),
        );
      }
  return {
    target,
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    far: Math.max(1000, distance * 4),
  };
}
