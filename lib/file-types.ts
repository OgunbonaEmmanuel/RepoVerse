/** Shared filename-based classification; it never inspects or executes contents. */
export const colors = {
  "Source code": "#8f9cff",
  Data: "#f1c66d",
  "Serialized files": "#d49cff",
  "Images / media": "#f48fac",
  Documentation: "#6ed8b2",
  Archives: "#ef9b64",
  Configuration: "#6ccce8",
  Unknown: "#9cabbc",
} as const;
export type FileCategory = keyof typeof colors;
export const supportsDependencies = (path: string) =>
  /\.[cm]?[jt]sx?$/i.test(path);
export function classifyFile(path: string): FileCategory {
  const name = path.split("/").pop()!.toLowerCase();
  if (
    /\.(pkl|pickle|joblib|pt|pth|onnx|h5|hdf5|npy|npz|rds|rdata|safetensors)$/.test(
      name,
    )
  )
    return "Serialized files";
  if (
    /\.(csv|tsv|parquet|arrow|feather|xlsx?|ods|db|sqlite3?|jsonl|ndjson)$/.test(
      name,
    )
  )
    return "Data";
  if (
    /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|avif|mp[34]|wav|ogg|flac|mov|webm|avi|woff2?|ttf|otf)$/.test(
      name,
    )
  )
    return "Images / media";
  if (/\.(zip|gz|tgz|tar|bz2|xz|7z|rar|zst|whl)$/.test(name)) return "Archives";
  if (
    /\.(mdx?|rst|txt|pdf|docx?)$/.test(name) ||
    /^(readme|license|licence|changelog|authors|copying)(\.|$)/.test(name)
  )
    return "Documentation";
  if (
    /\.(json|ya?ml|toml|ini|conf|config|properties|env)$/.test(name) ||
    /^(dockerfile|makefile|\.gitignore|\.gitattributes|\.editorconfig|\.env(?:\..*)?)$/.test(
      name,
    ) ||
    /\.(config|conf)\.[cm]?[jt]s$/.test(name)
  )
    return "Configuration";
  if (
    /\.(?:[cm]?[jt]sx?|css|scss|sass|html|py|ipynb|go|rs|java|c|h|cpp|hpp|cs|rb|php|sh|bash|ps1|sql|vue|svelte|swift|kt|scala|r|lua)$/.test(
      name,
    )
  )
    return "Source code";
  return "Unknown";
}
// CSV/data, serialized objects, archives, media and unknown formats are inventory only.
// This conservative allowlist controls downloads, never the presence of a file.
export function canPreview(path: string) {
  return (
    /\.(?:[cm]?[jt]sx?|json|md|mdx|txt|css|scss|sass|html|yaml|yml|toml|py|go|rs|java|c|h|cpp|hpp|sh|sql|vue|svelte|xml|ini|conf)$/i.test(
      path,
    ) ||
    /(^|\/)(Dockerfile|LICENSE|Makefile|README|\.gitignore|\.gitattributes|\.editorconfig)$/i.test(
      path,
    )
  );
}
export function knownBinary(path: string) {
  const category = classifyFile(path);
  return (
    ["Serialized files", "Images / media", "Archives"].includes(category) ||
    /\.(pdf|docx?|parquet|arrow|feather|xlsx?|ods|db|sqlite3?|exe|dll|so|bin)$/i.test(
      path,
    )
  );
}
