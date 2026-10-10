import { CityLayout, folderAncestors } from "../lib/layout";
export default function FolderNavigation({
  layout,
  current,
  collapsed,
  onFocus,
  onToggle,
}: {
  layout: CityLayout;
  current: string;
  collapsed: ReadonlySet<string>;
  onFocus: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const folder =
    layout.districts.find((d) => d.name === current) ?? layout.districts[0];
  return (
    <div className="folder-navigation">
      <nav aria-label="Folder breadcrumbs">
        {folderAncestors(folder.name).map((path, i) => (
          <span key={path}>
            {i > 0 && <span aria-hidden="true"> → </span>}
            <button
              aria-current={path === folder.name ? "location" : undefined}
              onClick={() => onFocus(path)}
            >
              {path ? path.split("/").pop() : "Repository"}
            </button>
          </span>
        ))}
      </nav>
      <div className="folder-actions">
        <span>
          {folder.fileCount} descendant files · {folder.directFileCount} direct
          {collapsed.has(folder.name) ? " · Collapsed" : ""}
        </span>
        <button
          disabled={folder.parent === null}
          onClick={() => onFocus(folder.parent ?? "")}
        >
          Parent folder
        </button>
        <button onClick={() => onFocus("")}>Full repository</button>
        {folder.name && (
          <button onClick={() => onToggle(folder.name)}>
            {collapsed.has(folder.name) ? "Expand" : "Collapse"} current folder
          </button>
        )}
      </div>
      {folder.children.length > 0 && (
        <div className="folder-children" aria-label="Child folders">
          {folder.children.map((path) => {
            const child = layout.districts.find((d) => d.name === path)!;
            return (
              <div key={path}>
                <button
                  aria-label={`Focus folder ${path}`}
                  onClick={() => onFocus(path)}
                >
                  ▱ {path.split("/").pop()}{" "}
                  <small>{child.fileCount} files</small>
                </button>
                <button
                  aria-label={`${collapsed.has(path) ? "Expand" : "Collapse"} folder ${path}`}
                  onClick={() => onToggle(path)}
                >
                  {collapsed.has(path) ? "+" : "−"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
