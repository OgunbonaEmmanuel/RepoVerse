const ignored = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "vendor",
  "__pycache__",
]);
export function exclusionReason(path: string): string | undefined {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === ".." || p === ".")
  )
    return "unsafe path";
  if (path.split("/").some((p) => ignored.has(p)))
    return "dependency, VCS or generated directory";
  if (
    /(^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|.*\.lock)$/.test(
      path,
    )
  )
    return "lock file";
}
