/** Synthetic provider output used only by offline tests. */
export const explanationFixture = {
  purpose: [
    {
      text: "Exports a greeting function.",
      references: [
        {
          start: 1,
          end: 2,
          excerpt: 'export function greet() {\n  return "hello";',
        },
      ],
    },
  ],
  symbols: [
    {
      text: "greet returns a greeting.",
      references: [
        {
          start: 1,
          end: 2,
          excerpt: 'export function greet() {\n  return "hello";',
        },
      ],
    },
  ],
  imports: [],
  limitations: [
    {
      text: "Dependency implementations and runtime callers were not supplied.",
      references: [],
    },
  ],
};
export const explanationInput = {
  consent: true,
  repository: "fixture/example",
  commit: "test-commit",
  path: "src/greet.ts",
  source: 'export function greet() {\n  return "hello";\n}',
  dependencies: [],
  analysisStatus: "parsed",
};

/** Synthetic import-use example, not a live model quality assessment. */
export const importUsageSource = [
  "import { format } from './format';",
  "export function label(user: { name: string }) {",
  "  const title = format(user.name);",
  "  return title;",
  "}",
].join("\n");
export const importUsageExplanation = {
  purpose: [
    {
      text: "Builds a label from a user's name.",
      references: [
        {
          start: 2,
          end: 4,
          excerpt:
            "export function label(user: { name: string }) {\n  const title = format(user.name);\n  return title;",
        },
      ],
    },
  ],
  symbols: [],
  imports: [
    {
      text: "Passes user.name to format from ./format and returns the resulting title.",
      references: [
        {
          start: 3,
          end: 4,
          excerpt: "  const title = format(user.name);\n  return title;",
        },
      ],
    },
  ],
  limitations: [],
};
