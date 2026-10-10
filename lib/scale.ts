import { analyze } from "./analyze";
export function scaleGraph(count = 1000) {
  return analyze(
    Array.from({ length: count }, (_, i) => ({
      path: `district-${Math.floor(i / 50)
        .toString()
        .padStart(2, "0")}/file-${i.toString().padStart(4, "0")}.ts`,
      source: `import {value as previous} from '../district-${Math.floor(
        ((i + count - 1) % count) / 50,
      )
        .toString()
        .padStart(
          2,
          "0",
        )}/file-${((i + count - 1) % count).toString().padStart(4, "0")}';\nexport const value = ${i};\nexport const prior = () => previous;\n${"// documented scale fixture\n".repeat(i % 80)}`,
    })),
    {
      name: `Generated ${count}-file test fixture`,
      commit: "generated-scale-v1",
      demo: true,
    },
  );
}
