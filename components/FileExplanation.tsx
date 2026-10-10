"use client";
import { useEffect, useRef, useState } from "react";
import type { FileNode, Graph } from "../lib/model";
import { sourceLines } from "../lib/source-lines";
import {
  EXPLANATION_SECTIONS,
  ExplanationResult,
  SourceReference,
  explanationUnavailable,
  validateExplanation,
} from "../lib/explanation";
export default function FileExplanation({
  file,
  graph,
}: {
  file: FileNode;
  graph: Graph;
}) {
  const [disclosed, setDisclosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [reference, setReference] = useState<SourceReference | null>(null);
  const active = useRef<AbortController | null>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const unavailable = explanationUnavailable(file);
  const lines = sourceLines(file.source ?? "");
  const snapshot = JSON.stringify([
    graph.name,
    graph.commit,
    file.id,
    file.blobSha,
    file.source,
  ]);
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  useEffect(() => {
    setResult(null);
    setReference(null);
    setLoading(false);
    setError("");
    setDisclosed(false);
    return () => {
      active.current?.abort();
    };
  }, [snapshot]);
  useEffect(() => {
    if (reference) {
      highlighted.current?.scrollIntoView?.({ block: "nearest" });
      highlighted.current?.focus();
    }
  }, [reference]);
  async function explain() {
    if (unavailable || loading) return;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    active.current = controller;
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          consent: true,
          repository: graph.name,
          commit: graph.commit,
          path: file.id,
          blobSha: file.blobSha,
          source: file.source,
          analysisStatus: file.status,
          dependencies: graph.imports
            .filter((e) => e.from === file.id)
            .map(({ specifier, kind, line, to, reason }) => ({
              specifier,
              kind,
              line,
              to,
              reason,
            })),
        }),
      });
      const data = await response.json();
      if (controller.signal.aborted || currentSnapshot.current !== snapshot)
        return;
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Explanation unavailable. Please retry.",
        );
      if (
        data.repository !== graph.name ||
        data.commit !== graph.commit ||
        data.path !== file.id ||
        (file.blobSha && data.blobSha !== file.blobSha) ||
        data.totalLines !== lines.length ||
        !Number.isInteger(data.suppliedLines) ||
        data.suppliedLines < 1 ||
        data.suppliedLines > lines.length
      )
        throw new Error("Explanation did not match the selected file.");
      const explanation = validateExplanation(
        data.explanation,
        file.source!,
        data.suppliedLines,
      );
      setResult({ ...data, explanation });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Explanation unavailable. Please retry.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <>
      <section className="file-explanation" aria-label="AI file explanation">
        <h3>AI file explanation</h3>
        {unavailable ? (
          <p>{unavailable}</p>
        ) : (
          <>
            {!disclosed ? (
              <button onClick={() => setDisclosed(true)}>
                Explain this file
              </button>
            ) : (
              <>
                <p className="ai-disclosure">
                  On request, the selected source code (up to 24 KiB / 800
                  lines), its path, language and known direct-import metadata
                  will be sent to OpenAI using the server-configured model.
                  Dependency source and the rest of the repository are not sent.
                  API usage may incur charges.
                </p>
                <button disabled={loading} onClick={() => void explain()}>
                  {loading
                    ? "Explaining file…"
                    : error
                      ? "Retry explanation"
                      : result
                        ? "Request explanation again"
                        : "Send selected source and explain"}
                </button>
              </>
            )}
            {loading && (
              <p role="status">Generating an explanation for {file.id}…</p>
            )}
            {error && <p role="alert">{error}</p>}
            {result && (
              <div className="explanation-result">
                <p>
                  AI-generated · {result.model}. Verify claims against the
                  source.
                </p>
                {result.truncated && (
                  <p className="error">
                    Based on truncated source: lines 1–{result.suppliedLines} of{" "}
                    {result.totalLines}.
                  </p>
                )}
                {result.dependenciesTruncated && (
                  <p>Direct-import metadata was also truncated.</p>
                )}
                {Object.entries(EXPLANATION_SECTIONS)
                  .filter(
                    ([key]) =>
                      key !== "limitations" ||
                      result.explanation.limitations.length > 0,
                  )
                  .map(([key, title]) => (
                    <section key={key}>
                      <h4>{title}</h4>
                      {result.explanation[
                        key as keyof typeof EXPLANATION_SECTIONS
                      ].length === 0 && (
                        <p>None identified in the supplied source.</p>
                      )}
                      {result.explanation[
                        key as keyof typeof EXPLANATION_SECTIONS
                      ].map((item, index) => (
                        <div key={index}>
                          <p>{item.text}</p>
                          {item.references.some(
                            (ref) => ref.verification !== "matched",
                          ) && (
                            <p className="citation-warning">
                              This claim has an unverified citation.
                            </p>
                          )}
                          <div className="source-references">
                            {item.references.map((ref, i) =>
                              ref.verification === "matched" ? (
                                <button
                                  key={i}
                                  title={`Exact source excerpt matched: ${ref.excerpt}`}
                                  onClick={() => setReference({ ...ref })}
                                  aria-label={`Reveal source lines ${ref.start} to ${ref.end}`}
                                >
                                  L{ref.start}
                                  {ref.end !== ref.start ? `–${ref.end}` : ""}
                                </button>
                              ) : (
                                <span className="citation-warning" key={i}>
                                  Unverified citation (L{ref.start}–{ref.end}):{" "}
                                  {ref.verification === "out-of-range"
                                    ? "outside supplied source"
                                    : "excerpt does not match these lines"}
                                  .
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </section>
                  ))}
                <details>
                  <summary>About this explanation</summary>
                  <p>
                    Clickable references have exact excerpts matching the cited
                    source lines. This checks location, not whether the code
                    supports the claim. Unverified citations are not clickable.
                  </p>
                </details>
              </div>
            )}
          </>
        )}
      </section>
      {file.source !== null && (
        <>
          <h3>
            Source <small>read only</small>
          </h3>
          {reference && (
            <p role="status">
              Showing source lines {reference.start}–{reference.end}{" "}
              <button onClick={() => setReference(null)}>
                Clear line highlight
              </button>
            </p>
          )}
          <pre tabIndex={0} aria-label={`Source of ${file.id}`}>
            <code>
              {reference ? (
                <>
                  {lines.slice(0, reference.start - 1).join("\n")}
                  {reference.start > 1 ? "\n" : ""}
                  <mark
                    ref={highlighted}
                    tabIndex={-1}
                    aria-label={`Source lines ${reference.start} to ${reference.end}`}
                  >
                    {lines.slice(reference.start - 1, reference.end).join("\n")}
                  </mark>
                  {reference.end < lines.length ? "\n" : ""}
                  {lines.slice(reference.end).join("\n")}
                </>
              ) : (
                lines.join("\n")
              )}
            </code>
          </pre>
        </>
      )}
    </>
  );
}
