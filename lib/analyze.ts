import ts from "typescript";
import {
  FileNode,
  Graph,
  ImportRecord,
  LIMITS,
  Limits,
  SourceInput,
} from "./model";
import { exclusionReason } from "./policy";
import { inventoryFile, loadText, wantsPreview } from "./inventory";
const extensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];
function normalize(path: string) {
  const result: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      if (!result.length) return undefined;
      result.pop();
    } else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}
export function resolveRelative(
  from: string,
  spec: string,
  paths: Set<string>,
): string | undefined {
  const base = normalize(`${from.slice(0, from.lastIndexOf("/") + 1)}${spec}`);
  if (!base) return;
  const substituted = base.replace(/\.(?:js|jsx|mjs|cjs)$/, "");
  const candidates = [
    base,
    ...(substituted !== base ? extensions.map((e) => substituted + e) : []),
    ...extensions.map((e) => base + e),
    ...extensions.map((e) => `${base}/index${e}`),
  ];
  return candidates.find((p) => paths.has(p));
}
export function analyze(
  inputs: SourceInput[],
  metadata: Pick<Graph, "name" | "commit" | "demo">,
  limits: Limits = LIMITS,
): Graph {
  const files: FileNode[] = [];
  const exclusions: Graph["exclusions"] = [];
  let partial = false;
  let total = 0;
  for (const input of [...inputs].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const bytes = new TextEncoder().encode(input.source).length;
    const reason =
      exclusionReason(input.path) ??
      (files.length >= limits.files ? "inventory file-count limit" : undefined);
    if (reason) {
      exclusions.push({ path: input.path, reason });
      if (reason.includes("limit")) partial = true;
      continue;
    }
    const file = inventoryFile(input.path, bytes, limits);
    files.push(file);
    if (!wantsPreview(file, limits)) continue;
    if (total + bytes > limits.total) {
      file.contentStatus = "download-limit";
      continue;
    }
    total += bytes;
    if (input.source.includes("\0")) {
      file.contentStatus = "binary";
      continue;
    }
    loadText(file, input.source, bytes);
  }
  const graph = analyzeFiles(files, metadata);
  graph.exclusions = exclusions;
  graph.inventoryIncomplete = partial;
  graph.partial ||= partial;
  return graph;
}
/** Resolve parsed imports against the complete inventory, including unloaded targets. */
export function analyzeFiles(
  files: FileNode[],
  metadata: Pick<Graph, "name" | "commit" | "demo">,
  resolutionPaths?: Set<string>,
): Graph {
  const graph: Graph = {
    ...metadata,
    files: files.map((f) => ({ ...f })),
    imports: [],
    exclusions: [],
    partial: files.some(
      (f) =>
        f.status === "not analysed" ||
        ["too-large", "download-limit", "error"].includes(f.contentStatus),
    ),
    inventoryIncomplete: false,
    warnings: [],
  };
  const paths = resolutionPaths ?? new Set(graph.files.map((f) => f.id));
  for (const file of graph.files) {
    if (file.source === null || file.status === "unsupported") continue;
    const ast = ts.createSourceFile(
      file.id,
      file.source,
      ts.ScriptTarget.Latest,
      true,
    );
    const diagnostics = (
      ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    if (diagnostics.length) {
      file.status = "syntax errors";
      graph.warnings.push(
        `${file.id}: syntax errors; extracted imports may be incomplete`,
      );
    }
    function record(node: ts.Node, expression?: ts.Expression) {
      const line =
        ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (!expression || !ts.isStringLiteralLike(expression)) {
        graph.imports.push({
          from: file.id,
          specifier: expression?.getText(ast) ?? "(missing)",
          line,
          kind: "unresolved",
          reason: "computed or unsupported import expression",
        });
        return;
      }
      const specifier = expression.text;
      const edge: ImportRecord = {
        from: file.id,
        specifier,
        line,
        kind: "external",
      };
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        edge.to = resolveRelative(file.id, specifier, paths);
        edge.kind = edge.to ? "internal" : "unresolved";
        if (!edge.to)
          edge.reason = "relative target missing, excluded or outside scope";
      } else if (/^(?:@\/|~|#|\/)/.test(specifier)) {
        edge.kind = "unresolved";
        edge.reason = "alias or absolute path unsupported";
      } else {
        edge.reason =
          "bare package or alias; package exports and configuration are not evaluated";
      }
      graph.imports.push(edge);
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) record(node, node.moduleSpecifier);
      else if (ts.isExportDeclaration(node) && node.moduleSpecifier)
        record(node, node.moduleSpecifier);
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        record(node, node.moduleReference.expression);
      else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      )
        record(node, node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return graph;
}
