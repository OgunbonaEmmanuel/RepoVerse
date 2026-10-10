import { FileRecovery, Graph } from "./model";
/** Replace only the recovered file's direct outgoing edges; incoming edges remain intact. */
export function applyFileRecovery(graph: Graph, result: FileRecovery): Graph {
  if (
    graph.recoveryId !== result.recoveryId ||
    graph.commit !== result.commit ||
    !graph.files.some((f) => f.id === result.file.id)
  )
    return graph;
  const files = graph.files.map((f) =>
    f.id === result.file.id ? result.file : f,
  );
  return {
    ...graph,
    files,
    imports: [
      ...graph.imports.filter((e) => e.from !== result.file.id),
      ...result.imports.filter((e) => e.from === result.file.id),
    ],
    warnings: [
      ...graph.warnings.filter(
        (w) => !w.startsWith(`${result.file.id}: syntax errors;`),
      ),
      ...result.warnings,
    ],
    partial:
      graph.inventoryIncomplete ||
      files.some(
        (f) =>
          f.status === "not analysed" ||
          f.status === "syntax errors" ||
          ["too-large", "download-limit", "error"].includes(f.contentStatus),
      ),
  };
}
