import { FileNode, ImportRecord } from "./model";
export { colors } from "./file-types";
import type { FileCategory } from "./file-types";
export const METADATA_HEIGHT = 0.85;
export const PADDING = 1.2,
  LABEL_SPACE = 3,
  GAP = 1.2,
  CELL = 2.2,
  LEVEL_RISE = 0.3;
export interface Building {
  id: string;
  x: number;
  z: number;
  baseY: number;
  height: number;
  category: FileCategory;
  metadataOnly: boolean;
  district: string;
}
export interface District {
  name: string;
  parent: string | null;
  level: number;
  x: number;
  z: number;
  elevation: number;
  width: number;
  depth: number;
  labelX: number;
  labelZ: number;
  fileCount: number;
  directFileCount: number;
  children: string[];
}
export interface CityLayout {
  buildings: Building[];
  districts: District[];
  center: readonly [number, number];
  extent: number;
}
export interface VisibleCity {
  buildings: Building[];
  districts: District[];
  hiddenBy: Map<string, string>;
}
interface Folder {
  path: string;
  files: FileNode[];
  children: Map<string, Folder>;
}
interface PackedItem {
  folder?: MeasuredFolder;
  files?: FileNode[];
  width: number;
  depth: number;
  x: number;
  z: number;
  key: string;
}
interface MeasuredFolder {
  path: string;
  width: number;
  depth: number;
  fileCount: number;
  directFileCount: number;
  items: PackedItem[];
}
export function fileFolder(path: string) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}
export function folderAncestors(path: string): string[] {
  const result = [""];
  if (path) {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++)
      result.push(parts.slice(0, i).join("/"));
  }
  return result;
}
export function revealFolder(collapsed: ReadonlySet<string>, path: string) {
  const next = new Set(collapsed);
  for (const ancestor of folderAncestors(path)) next.delete(ancestor);
  return next;
}

/** Recursive shelf packing: direct files occupy a separate block from child platforms.
 * Every folder (including implicit parents and repository root) reserves a label strip.
 * Collapse is a visibility operation, so a snapshot's coordinates never jump. */
export function cityLayout(files: FileNode[]): CityLayout {
  const root: Folder = { path: "", files: [], children: new Map() };
  for (const file of [...files].sort((a, b) => a.id.localeCompare(b.id))) {
    let node = root;
    for (const part of fileFolder(file.id).split("/").filter(Boolean)) {
      const path = node.path ? `${node.path}/${part}` : part;
      if (!node.children.has(part))
        node.children.set(part, { path, files: [], children: new Map() });
      node = node.children.get(part)!;
    }
    node.files.push(file);
  }
  function measure(folder: Folder): MeasuredFolder {
    const items: PackedItem[] = [...folder.children.values()].map((child) => {
      const measured = measure(child);
      return {
        folder: measured,
        width: measured.width,
        depth: measured.depth,
        x: 0,
        z: 0,
        key: child.path,
      };
    });
    if (folder.files.length) {
      const columns = Math.ceil(Math.sqrt(folder.files.length));
      items.push({
        files: folder.files,
        width: columns * CELL,
        depth: Math.ceil(folder.files.length / columns) * CELL,
        x: 0,
        z: 0,
        key: "",
      });
    }
    items.sort((a, b) => b.depth - a.depth || a.key.localeCompare(b.key));
    const target = Math.max(
      4,
      ...items.map((i) => i.width),
      Math.sqrt(
        items.reduce((sum, i) => sum + (i.width + GAP) * (i.depth + GAP), 0),
      ) * 1.15,
    );
    let x = 0,
      z = 0,
      rowDepth = 0,
      usedWidth = 0;
    for (const item of items) {
      if (x > 0 && x + item.width > target) {
        z += rowDepth + GAP;
        x = 0;
        rowDepth = 0;
      }
      item.x = x;
      item.z = z;
      x += item.width + GAP;
      usedWidth = Math.max(usedWidth, x - GAP);
      rowDepth = Math.max(rowDepth, item.depth);
    }
    return {
      path: folder.path,
      width: Math.max(5, usedWidth + PADDING * 2),
      depth: Math.max(5, z + rowDepth + PADDING * 2 + LABEL_SPACE),
      directFileCount: folder.files.length,
      fileCount:
        folder.files.length +
        items.reduce((sum, i) => sum + (i.folder?.fileCount ?? 0), 0),
      items,
    };
  }
  const buildings: Building[] = [],
    districts: District[] = [];
  function place(
    folder: MeasuredFolder,
    left: number,
    top: number,
    level: number,
    parent: string | null,
  ) {
    const elevation = level * LEVEL_RISE;
    districts.push({
      name: folder.path,
      parent,
      level,
      x: left + folder.width / 2,
      z: top + folder.depth / 2,
      elevation,
      width: folder.width,
      depth: folder.depth,
      labelX: left + folder.width / 2,
      labelZ: top + PADDING + LABEL_SPACE / 2,
      fileCount: folder.fileCount,
      directFileCount: folder.directFileCount,
      children: folder.items
        .flatMap((i) => (i.folder ? [i.folder.path] : []))
        .sort(),
    });
    for (const item of folder.items) {
      const x = left + PADDING + item.x,
        z = top + PADDING + LABEL_SPACE + item.z;
      if (item.folder) place(item.folder, x, z, level + 1, folder.path);
      else if (item.files) {
        const columns = Math.round(item.width / CELL);
        item.files.forEach((file, i) =>
          buildings.push({
            id: file.id,
            x: x + ((i % columns) + 0.5) * CELL,
            z: z + (Math.floor(i / columns) + 0.5) * CELL,
            baseY: elevation + 0.02,
            height:
              file.lines === null
                ? METADATA_HEIGHT
                : Math.min(10, 0.6 + Math.log2(1 + file.lines) * 0.65),
            metadataOnly: file.lines === null,
            category: file.category,
            district: folder.path,
          }),
        );
      }
    }
  }
  const measured = measure(root);
  place(measured, -measured.width / 2, -measured.depth / 2, 0, null);
  return {
    buildings,
    districts,
    center: [0, 0],
    extent: Math.max(measured.width, measured.depth),
  };
}
export function visibleCity(
  layout: CityLayout,
  collapsed: ReadonlySet<string>,
): VisibleCity {
  const hiddenBy = new Map<string, string>();
  const covering = (folder: string, includeSelf: boolean) =>
    folderAncestors(folder).find(
      (p) => p !== "" && (includeSelf || p !== folder) && collapsed.has(p),
    );
  const buildings = layout.buildings.filter((b) => {
    const hidden = covering(b.district, true);
    if (hidden !== undefined) {
      hiddenBy.set(b.id, hidden);
      return false;
    }
    return true;
  });
  return {
    buildings,
    districts: layout.districts.filter(
      (d) => covering(d.name, false) === undefined,
    ),
    hiddenBy,
  };
}
export interface DependencySegment {
  edge: ImportRecord;
  from: readonly [number, number, number];
  to: readonly [number, number, number];
}
export function dependencySegments(
  edges: ImportRecord[],
  city: VisibleCity,
): DependencySegment[] {
  const byId = new Map(city.buildings.map((b) => [b.id, b]));
  return edges.flatMap((edge) => {
    const a = byId.get(edge.from),
      b = byId.get(edge.to ?? "");
    return a && b
      ? [
          {
            edge,
            from: [a.x, a.baseY + a.height + 0.3, a.z] as const,
            to: [b.x, b.baseY + b.height + 0.3, b.z] as const,
          },
        ]
      : [];
  });
}
