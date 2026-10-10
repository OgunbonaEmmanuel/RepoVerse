import { FileNode } from "../lib/model";
import { colors } from "../lib/file-types";
import { useEffect, useRef } from "react";
interface Tree {
  files: FileNode[];
  directories: Map<string, Tree>;
}
export default function FileTree({
  files,
  selected,
  onSelect,
  onFocusFolder,
}: {
  files: FileNode[];
  selected: string;
  onSelect: (id: string) => void;
  onFocusFolder: (path: string) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const button = [
      ...(navigation.current?.querySelectorAll("button") ?? []),
    ].find((b) => b.title === selected);
    if (!button) return;
    let parent = button.parentElement;
    while (parent && parent !== navigation.current) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    button.scrollIntoView?.({ block: "nearest" });
  }, [selected, files]);
  const root: Tree = { files: [], directories: new Map() };
  for (const file of files) {
    const parts = file.id.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.directories.has(part))
        node.directories.set(part, { files: [], directories: new Map() });
      node = node.directories.get(part)!;
    }
    node.files.push(file);
  }
  function render(node: Tree, parent = ""): React.ReactNode {
    return (
      <>
        {[...node.directories].map(([name, child]) => (
          <details open key={name}>
            <summary>
              ▱ {name}{" "}
              <button
                className="tree-folder-focus"
                aria-label={`Focus directory ${parent ? parent + "/" : ""}${name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFocusFolder(parent ? parent + "/" + name : name);
                }}
              >
                ↗
              </button>
            </summary>
            <div className="tree-indent">
              {render(child, parent ? parent + "/" + name : name)}
            </div>
          </details>
        ))}
        {node.files.map((f) => (
          <button
            key={f.id}
            title={f.id}
            aria-label={`Select ${f.id}`}
            aria-pressed={selected === f.id}
            className={`file ${selected === f.id ? "selected" : ""}`}
            data-category={f.category}
            onClick={() => onSelect(f.id)}
          >
            <span
              style={{
                color: colors[f.category],
              }}
            >
              {f.lines === null ? "◇" : "▧"}
            </span>{" "}
            {f.id.split("/").pop()}
          </button>
        ))}
      </>
    );
  }
  return (
    <nav ref={navigation} aria-label="Repository files" className="file-tree">
      {render(root)}
    </nav>
  );
}
