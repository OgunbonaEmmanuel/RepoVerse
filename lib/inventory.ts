import { FileNode, Limits } from "./model";
import {
  canPreview,
  classifyFile,
  knownBinary,
  supportsDependencies,
} from "./file-types";

export function inventoryFile(
  path: string,
  bytes: number | null,
  limits: Limits,
): FileNode {
  return {
    id: path,
    bytes,
    source: null,
    lines: null,
    category: classifyFile(path),
    status: supportsDependencies(path) ? "not analysed" : "unsupported",
    contentStatus:
      bytes !== null && bytes > limits.perFile
        ? "too-large"
        : knownBinary(path)
          ? "binary"
          : "not-loaded",
  };
}
export function wantsPreview(file: FileNode, limits: Limits) {
  // Unknown sizes stay in inventory; avoid an unbudgeted content request.
  return (
    file.bytes !== null && file.bytes <= limits.perFile && canPreview(file.id)
  );
}
/** Only operates on already bounded UTF-8 text. LFS assets are never fetched. */
export function loadText(file: FileNode, source: string, bytes: number) {
  const pointer =
    /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\n(?:ext-[^\n]*\r?\n)*oid sha256:([a-f0-9]{64})\r?\nsize (\d+)\r?\n?$/.exec(
      source,
    );
  if (pointer && Number.isSafeInteger(Number(pointer[2]))) {
    file.contentStatus = "lfs";
    file.lfs = {
      pointerBytes: bytes,
      assetBytes: Number(pointer[2]),
      oid: pointer[1],
    };
    file.status = supportsDependencies(file.id)
      ? "not analysed"
      : "unsupported";
    return;
  }
  file.source = source;
  file.lines = source ? source.split(/\r?\n/).length : 0;
  file.contentStatus = "loaded";
  file.status = supportsDependencies(file.id) ? "parsed" : "unsupported";
}
