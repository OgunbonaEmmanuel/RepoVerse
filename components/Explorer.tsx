"use client";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import {
  Graph,
  FileRecovery,
  DownloadFailure,
  connected,
  contentLabels,
} from "../lib/model";
import { applyFileRecovery } from "../lib/apply-recovery";
import { supportsDependencies } from "../lib/file-types";
import FileRetry from "./FileRetry";
import {
  colors,
  cityLayout,
  visibleCity,
  fileFolder,
  revealFolder,
} from "../lib/layout";
import { CameraTarget } from "../lib/city-camera";
import FolderNavigation from "./FolderNavigation";
import FileTree from "./FileTree";
import { dependencyMessage } from "../lib/dependency-message";
const City = dynamic(() => import("./City"), {
  ssr: false,
  loading: () => <p className="fallback">Loading city renderer…</p>,
});
export default function Explorer({ initial }: { initial: Graph }) {
  const [graph, setGraph] = useState(initial);
  const [selected, setSelected] = useState(initial.files[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"outgoing" | "incoming">("outgoing");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  const [focus, setFocus] = useState(0);
  const [currentFolder, setCurrentFolder] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>({
    kind: "repository",
    id: "",
  });
  const layout = useMemo(() => cityLayout(graph.files), [graph]);
  const city = useMemo(
    () => visibleCity(layout, collapsed),
    [layout, collapsed],
  );
  const [zoom, setZoom] = useState(0);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const retryController = useRef<AbortController | null>(null);
  const [retrying, setRetrying] = useState("");
  const file = graph.files.find((f) => f.id === selected);
  const dependencyNote = file
    ? dependencyMessage(file, mode, graph.imports)
    : null;
  const visible = graph.files.filter((f) =>
    f.id.toLowerCase().includes(query.toLowerCase()),
  );
  const edges = connected(graph, selected, mode);
  const unresolved = graph.imports.filter(
    (e) => e.from === selected && e.kind !== "internal",
  );
  function select(id: string) {
    setSelected(id);
    if (query && !id.toLowerCase().includes(query.toLowerCase())) setQuery("");
    if (id) {
      const folder = fileFolder(id);
      setCollapsed((previous) => revealFolder(previous, folder));
      setCurrentFolder(folder);
      setCameraTarget({ kind: "file", id });
      setFocus((n) => n + 1);
    }
  }
  function focusFolder(path: string) {
    setCollapsed((previous) => revealFolder(previous, fileFolder(path)));
    setCurrentFolder(path);
    setCameraTarget({ kind: path ? "district" : "repository", id: path });
    setFocus((n) => n + 1);
  }
  function toggleFolder(path: string) {
    if (!path) return;
    setCollapsed((previous) => {
      const next = revealFolder(previous, fileFolder(path));
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setCurrentFolder(path);
    setCameraTarget({ kind: "district", id: path });
    setFocus((n) => n + 1);
  }
  function replace(next: Graph) {
    setGraph(next);
    setSelected(next.files[0]?.id ?? "");
    setQuery("");
    setMode("outgoing");
    setCollapsed(new Set());
    setCurrentFolder("");
    setCameraTarget({ kind: "repository", id: "" });
    setFocus((n) => n + 1);
  }
  async function load(demo = false) {
    retryController.current?.abort();
    setRetrying("");
    active.current?.abort();
    const token = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setStatus(
      demo
        ? "Loading bundled fixture…"
        : "Resolving snapshot, reading bounded sources, and parsing imports…",
    );
    try {
      const response = await fetch(demo ? "/api/demo" : "/api/import", {
        method: demo ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: demo ? undefined : JSON.stringify({ url }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import failed");
      if (token === generation.current) {
        replace(result);
        setStatus("Analysis ready");
      }
    } catch (e) {
      if (token === generation.current && !controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Import failed");
        setStatus("");
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function cancel() {
    active.current?.abort();
    generation.current++;
    setBusy(false);
    setStatus("Import cancelled; current snapshot retained.");
  }
  async function retryFile() {
    if (!file || !graph.recoveryId || retrying || busy) return;
    const path = file.id,
      recoveryId = graph.recoveryId,
      commit = graph.commit;
    const token = generation.current;
    const controller = new AbortController();
    retryController.current = controller;
    setRetrying(path);
    setError("");
    setStatus("Loading selected file from the imported commit…");
    try {
      const response = await fetch("/api/retry-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryId, commit, path }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (token !== generation.current) return;
      if (!response.ok) {
        setGraph((previous) =>
          previous.recoveryId !== recoveryId
            ? previous
            : {
                ...previous,
                files: previous.files.map((f) =>
                  f.id === path
                    ? {
                        ...f,
                        failure: result.failure as DownloadFailure | undefined,
                        contentReason: result.error,
                        retriesRemaining:
                          response.status === 410 || response.status === 413
                            ? 0
                            : (result.retriesRemaining ?? f.retriesRemaining),
                      }
                    : f,
                ),
              },
        );
        throw new Error(result.error ?? "File retry failed.");
      }
      setGraph((previous) =>
        applyFileRecovery(previous, result as FileRecovery),
      );
      setStatus(
        "File loaded; direct imports and incoming connections updated.",
      );
    } catch (cause) {
      if (token === generation.current) {
        setError(
          controller.signal.aborted
            ? "File loading cancelled. The current snapshot is retained; retry remains available."
            : cause instanceof Error
              ? cause.message
              : "File loading failed.",
        );
        setStatus("");
      }
    } finally {
      if (token === generation.current) setRetrying("");
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ▥ <strong>RepoVerse</strong>
          <span>CODE, MAPPED</span>
        </a>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            aria-label="Public GitHub repository URL"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            Import repository ↗
          </button>
        </form>
        <button onClick={() => void load(true)}>Load demo</button>
        {busy && <button onClick={cancel}>Cancel</button>}
      </header>
      <section className="snapshot">
        <div>
          <span className="eyebrow">
            {graph.demo
              ? "BUNDLED DEMO · OFFLINE FIXTURE"
              : "PUBLIC GITHUB SNAPSHOT"}
          </span>
          <h1>{graph.name}</h1>
          <p>
            Commit <code>{graph.commit}</code> · {graph.files.length}{" "}
            inventoried files ·{" "}
            {graph.imports.filter((e) => e.kind === "internal").length} resolved
            imports
          </p>
        </div>
        <div className="coverage">
          <b>{graph.partial ? "Partial import" : "Snapshot loaded"}</b>
          <span>
            {graph.inventoryIncomplete
              ? "Inventory incomplete"
              : "Inventory loaded (policy exclusions apply)"}
          </span>
          <span>
            {graph.files.filter((f) => f.status === "parsed").length} files
            parsed ·{" "}
            {graph.files.filter((f) => f.status === "unsupported").length}{" "}
            dependencies unsupported ·{" "}
            {graph.files.filter((f) => f.source === null).length} metadata-only
            · {graph.exclusions.length} excluded
          </span>
        </div>
      </section>
      <div role="status" className="status">
        {busy && <span className="pulse" />}
        {status}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="workspace">
        <aside className="sidebar">
          <div className="panel-heading">
            <h2>Repository</h2>
            <span>{visible.length}</span>
          </div>
          <input
            aria-label="Search files"
            placeholder="Search filename or path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visible[0]) select(visible[0].id);
            }}
          />
          <FileTree
            files={visible}
            selected={selected}
            onSelect={select}
            onFocusFolder={focusFolder}
          />
          {!visible.length && <p>No matching files.</p>}
          <div className="sidebar-footer">
            JS / TS dependency analysis
            <br />
            Other files remain in the inventory.
          </div>
        </aside>
        <section className="city-panel" aria-label="Code city">
          <div className="city-toolbar">
            <span>
              EXPLORER <small> / {list ? "file list" : "city view"}</small>
            </span>
            <button onClick={() => setList((v) => !v)}>
              {list ? "City view" : "List view"}
            </button>
          </div>
          <FolderNavigation
            layout={layout}
            current={currentFolder}
            collapsed={collapsed}
            onFocus={focusFolder}
            onToggle={toggleFolder}
          />
          <div className="viewport">
            {list ? (
              <div className="fallback-list">
                {visible.map((f) => (
                  <button
                    aria-pressed={selected === f.id}
                    key={f.id}
                    onClick={() => select(f.id)}
                  >
                    {f.id}
                    <span>
                      {f.category} ·{" "}
                      {f.lines === null
                        ? "◇ Lines unknown"
                        : `${f.lines} lines`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <City
                graph={graph}
                selected={selected}
                mode={mode}
                onSelect={select}
                focus={focus}
                layout={layout}
                city={city}
                collapsed={collapsed}
                currentFolder={currentFolder}
                cameraTarget={cameraTarget}
                onFocusDistrict={focusFolder}
                zoom={zoom}
              />
            )}
            <div className="camera-controls">
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((n) => n + 1)}
              >
                +
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((n) => n - 1)}
              >
                −
              </button>
              <button onClick={() => select(selected)} disabled={!file}>
                Focus file
              </button>
              <button onClick={() => focusFolder("")}>Reset camera</button>
              <button onClick={() => select("")} disabled={!file}>
                Clear selection
              </button>
            </div>
          </div>
          <div className="legend">
            {Object.entries(colors).map(([name, color]) => (
              <span key={name}>
                <i style={{ background: color }} />
                {name}
              </span>
            ))}
            <p>
              Height = min(10, 0.6 + 0.65 × log₂(1 + lines)). White outline:
              selected. Gold outline: hovered. Teal arrows: imports; unrelated
              files dim.
            </p>
            <p>
              ◇ White roof diamond: metadata-only, line count unknown; fixed
              height 0.85. Colours identify file categories, not analysis
              support.
            </p>
            <p>
              Drag to orbit · scroll to zoom · arrow A → B means A imports B.
            </p>
          </div>
        </section>
        <aside className="details">
          <div className="panel-heading">
            <h2>File details</h2>
            <span>↗</span>
          </div>
          {file ? (
            <>
              <p className="breadcrumbs">{file.id.split("/").join(" / ")}</p>
              <p className="file-path">{file.id}</p>
              <h2 className="filename">{file.id.split("/").pop()}</h2>
              <div className="badges">
                <span>{file.category}</span>
                <span>
                  {file.status === "unsupported"
                    ? "Dependencies unsupported"
                    : file.status === "not analysed"
                      ? "Dependencies not analysed — contents unavailable"
                      : file.status}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Lines</dt>
                  <dd>{file.lines ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>
                    {file.lfs ? "Git pointer size" : "Git blob / fixture size"}
                  </dt>
                  <dd>
                    {file.bytes === null
                      ? "Unknown"
                      : `${file.bytes.toLocaleString()} B`}
                  </dd>
                </div>
              </dl>
              {file.lfs && (
                <p>
                  Pointer: {file.lfs.pointerBytes.toLocaleString()} B · LFS
                  asset: {file.lfs.assetBytes.toLocaleString()} B (declared by
                  pointer; not downloaded).
                </p>
              )}
              {file.githubUrl && (
                <p>
                  <a href={file.githubUrl} target="_blank" rel="noreferrer">
                    View file on GitHub ↗
                  </a>
                </p>
              )}
              <p className="content-status">
                {contentLabels[file.contentStatus]}
              </p>
              {file.source === null && !file.lfs && (
                <p>
                  Size describes the Git blob, if available. An uninspected Git
                  LFS asset may be larger; its actual size is unknown.
                </p>
              )}
              {file.contentReason && <p>{file.contentReason}</p>}
              {file.contentStatus === "error" && (
                <FileRetry
                  file={file}
                  available={
                    Boolean(graph.recoveryId) && supportsDependencies(file.id)
                  }
                  busy={Boolean(retrying) || busy}
                  onRetry={() => void retryFile()}
                  onCancel={() => retryController.current?.abort()}
                />
              )}
              <div className="tabs">
                <button
                  aria-pressed={mode === "outgoing"}
                  onClick={() => setMode("outgoing")}
                >
                  Imports
                </button>
                <button
                  aria-pressed={mode === "incoming"}
                  onClick={() => setMode("incoming")}
                >
                  Imported by
                </button>
              </div>
              <div className="connections">
                <p>
                  Direct imports only; indirect dependency chains are not
                  flattened.
                </p>
                {city.hiddenBy.has(selected) && (
                  <div className="hidden-connection">
                    Selected file is hidden inside {city.hiddenBy.get(selected)}
                    .{" "}
                    <button onClick={() => select(selected)}>
                      Reveal selected file
                    </button>
                  </div>
                )}
                {edges.map((e, i) => {
                  const target = mode === "outgoing" ? e.to! : e.from;
                  const hidden = city.hiddenBy.get(target);
                  return (
                    <button key={i} onClick={() => select(target)}>
                      <span>
                        {mode === "outgoing" ? "→" : "←"} {target}
                      </span>
                      <small>
                        {e.from}:{e.line} → {e.to}
                      </small>
                      {hidden && (
                        <small className="hidden-connection">
                          Hidden in collapsed {hidden} — click to reveal file
                        </small>
                      )}
                    </button>
                  );
                })}
                {dependencyNote && (
                  <p className="dependency-message">{dependencyNote}</p>
                )}
              </div>
              {mode === "outgoing" &&
                unresolved.map((e, i) => (
                  <p className="import-note" key={i}>
                    <b>
                      {e.kind === "external"
                        ? "External / bare specifier"
                        : "Unresolved"}
                      : {e.specifier}
                    </b>
                    <small>
                      Line {e.line} · {e.reason}
                    </small>
                  </p>
                ))}
              {file.source !== null && (
                <>
                  <h3>
                    Source <small>read only</small>
                  </h3>
                  <pre tabIndex={0} aria-label={`Source of ${file.id}`}>
                    <code>{file.source}</code>
                  </pre>
                </>
              )}
            </>
          ) : (
            <p>
              {graph.files.length
                ? "Select a building or file to inspect its source and dependencies."
                : "No inventoried files in this snapshot."}
            </p>
          )}
        </aside>
      </div>
      <footer>
        <p>
          Static imports describe code relationships, not runtime execution or
          proof of breakage. Bare imports may be packages or unconfigured
          aliases.
        </p>
        <details>
          <summary>
            Analysis coverage & exclusions ({graph.exclusions.length})
          </summary>
          <p>
            Relative JS/TS imports only; aliases and package exports are not
            resolved. Literal dynamic imports are included. Computed imports are
            unresolved. Unsupported files have no dependency analysis.
          </p>
          {graph.partial && (
            <p className="error">
              Partial results: some contents were not analysed, downloads were
              limited, or inventory is incomplete. Metadata-only files remain
              visible.
            </p>
          )}
          {graph.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          <ul>
            {graph.exclusions.map((e, i) => (
              <li key={i}>
                {e.path} — {e.reason}
              </li>
            ))}
          </ul>
        </details>
      </footer>
    </main>
  );
}
