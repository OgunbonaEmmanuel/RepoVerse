/** One numbering policy for AI input, evidence checks and source navigation.
 * Preserve blank lines (including a final empty line); normalize only line endings. */
export function sourceLines(source: string): string[] {
  return source.split(/\r\n|\n|\r/);
}
export function numberedSource(source: string): string {
  return sourceLines(source)
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}
