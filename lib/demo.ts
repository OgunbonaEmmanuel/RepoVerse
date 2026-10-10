import { analyze } from "./analyze";
export const demoSources = [
  {
    path: "src/main.ts",
    source:
      "import {App} from './ui/App';\nimport './styles.css';\nimport React from 'react';\nApp();",
  },
  {
    path: "src/ui/App.tsx",
    source:
      "import {store} from '../data';\nimport {format} from '../utils/format.js';\nexport function App() { return <main>{format(store.title)}</main>; }",
  },
  { path: "src/data/index.ts", source: "export {store} from './store';" },
  {
    path: "src/data/store.ts",
    source:
      "import {format} from '../utils/format';\nexport const store = { title: format('RepoVerse') };",
  },
  {
    path: "src/utils/format.ts",
    source:
      "import {store} from '../data/store';\nexport const format = (value: string) => value.trim();\nexport const title = () => store.title;",
  },
  {
    path: "src/legacy.cjs",
    source:
      "const app = require('./ui/App');\nconst missing = require('./missing');\nconst fs = require('node:fs');\nrequire(variable);",
  },
  {
    path: "src/aliases.ts",
    source:
      "import value from '@/config';\nexport const lazy = () => import('./data');",
  },
  {
    path: "src/styles.css",
    source: "body { font-family: system-ui; }\nmain { padding: 2rem; }",
  },
  {
    path: "scripts/report.py",
    source:
      'print("This file is visible, but Python dependencies are not analysed.")',
  },
  {
    path: "README.md",
    source:
      "# Bundled demo fixture\nA small, intentionally cyclic codebase. This source is never executed.",
  },
  { path: "package.json", source: '{"name":"demo-fixture","private":true}' },
  { path: "node_modules/ignored.js", source: "export default 1;" },
];
export function demoGraph() {
  return analyze(demoSources, {
    name: "RepoVerse / bundled demo",
    commit: "fixture-v1",
    demo: true,
  });
}
