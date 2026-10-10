"use client";
import { useEffect, useState } from "react";
import { FileNode } from "../lib/model";
export default function FileRetry({
  file,
  available,
  busy,
  onRetry,
  onCancel,
}: {
  file: FileNode;
  available: boolean;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const retryAt = file.failure?.retryAt ?? 0;
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);
  return (
    <div className="file-retry">
      {file.failure && (
        <p>
          {file.failure.attempted
            ? `Download attempts: ${file.failure.attempts}.`
            : "This file was not requested."}
          {file.failure.httpStatus &&
            ` GitHub HTTP ${file.failure.httpStatus}.`}
          {file.failure.requestId && ` Request ID: ${file.failure.requestId}.`}
        </p>
      )}
      {retryAt > now && (
        <p role="status">
          GitHub requested a wait until {new Date(retryAt).toLocaleTimeString()}{" "}
          ({Math.ceil((retryAt - now) / 1000)} seconds).
        </p>
      )}
      {available && (
        <>
          <button
            disabled={busy || retryAt > now || file.retriesRemaining === 0}
            onClick={onRetry}
          >
            {busy ? "Loading file…" : "Retry loading file"}
          </button>
          {busy && <button onClick={onCancel}>Cancel file loading</button>}
          <p>
            {file.retriesRemaining ?? 0} retry actions remaining for this
            snapshot.
          </p>
        </>
      )}
    </div>
  );
}
