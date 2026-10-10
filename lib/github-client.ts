import { boundedBytes, ImportError } from "./github-transport";
import type { DownloadFailure } from "./model";
export interface RateGate {
  retryAt: number;
}
const runtime = globalThis as typeof globalThis & {
  repoVerseRateGate?: RateGate;
};
const sharedGate = (runtime.repoVerseRateGate ??= { retryAt: 0 });
export interface ClientOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  token?: string;
  maxAttempts?: number;
  rateGate?: RateGate;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  requestTimeoutMs?: number;
}
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}
export function retryTime(
  headers: Headers,
  now: number,
  rateLimited: boolean,
): number | undefined {
  const after = headers.get("retry-after");
  const reset =
    headers.get("x-ratelimit-remaining") === "0"
      ? Number(headers.get("x-ratelimit-reset")) * 1000
      : NaN;
  const afterTime =
    after === null
      ? NaN
      : /^\d+(?:\.\d+)?$/.test(after)
        ? now + Number(after) * 1000
        : Date.parse(after);
  const deadlines = [afterTime, reset].filter(
    (v) => Number.isFinite(v) && v > now,
  );
  return deadlines.length
    ? Math.max(...deadlines) + 100
    : rateLimited
      ? now + 60_000
      : undefined;
}
export function createGitHubClient(
  owner: string,
  repo: string,
  options: ClientOptions = {},
) {
  const now = options.now ?? Date.now;
  const gate =
    options.rateGate ?? (options.fetcher ? { retryAt: 0 } : sharedGate);
  const fetcher = options.fetcher ?? fetch;
  const prefix = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return async function api<T>(
    suffix: string,
    cap = 4 * 1024 * 1024,
  ): Promise<T> {
    const maximum = Math.min(2, Math.max(1, options.maxAttempts ?? 1));
    for (let attempt = 1; attempt <= maximum; attempt++) {
      if (options.signal?.aborted) {
        const timedOut = options.signal.reason?.name === "TimeoutError";
        const message = timedOut
          ? "The overall GitHub download deadline expired."
          : "File loading was cancelled before the request.";
        throw new ImportError(message, timedOut ? 504 : 408, {
          kind:
            options.signal.reason?.name === "TimeoutError"
              ? "timeout"
              : "cancelled",
          message,
          attempts: attempt - 1,
          attempted: attempt > 1,
        });
      }
      if (gate.retryAt > now())
        throw new ImportError(
          "GitHub requests are paused until the rate-limit retry time.",
          429,
          {
            kind: "rate-limit",
            message:
              "GitHub requests are paused until the rate-limit retry time.",
            retryAt: gate.retryAt,
            attempts: 0,
            attempted: false,
          },
        );
      const timeout = AbortSignal.timeout(options.requestTimeoutMs ?? 10_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      let failure: DownloadFailure;
      try {
        const response = await fetcher(prefix + suffix, {
          redirect: "error",
          cache: "no-store",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(options.token
              ? { Authorization: `Bearer ${options.token}` }
              : {}),
          },
          signal,
        });
        if (!response.ok) {
          let rateBody = false;
          if (response.status === 403) {
            try {
              rateBody = /rate limit|secondary rate/i.test(
                new TextDecoder().decode(
                  await boundedBytes(response, 16_384, signal),
                ),
              );
            } catch {
              /* Headers still describe the failure; never expose arbitrary response bodies. */
            }
          } else await response.body?.cancel();
          const limited =
            response.status === 429 ||
            (response.status === 403 &&
              (rateBody ||
                response.headers.get("x-ratelimit-remaining") === "0" ||
                response.headers.has("retry-after")));
          const retryAt = retryTime(response.headers, now(), limited);
          if (retryAt) gate.retryAt = Math.max(gate.retryAt, retryAt);
          const message = limited
            ? "GitHub rate limit reached; content was not downloaded."
            : response.status === 404
              ? "GitHub file or public repository not found at this snapshot."
              : response.status === 403
                ? "GitHub denied access (HTTP 403); this is not a file-size limit."
                : `GitHub returned HTTP ${response.status}; content was not downloaded.`;
          throw new ImportError(message, limited ? 429 : response.status, {
            kind: limited ? "rate-limit" : "http",
            message,
            httpStatus: response.status,
            requestId: response.headers.get("x-github-request-id") ?? undefined,
            retryAt,
            attempts: attempt,
            attempted: true,
          });
        }
        const bytes = await boundedBytes(response, cap, signal);
        try {
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          ) as T;
        } catch {
          throw new ImportError(
            "GitHub returned invalid JSON or text encoding.",
            502,
            {
              kind: "invalid-response",
              message: "GitHub returned invalid JSON or text encoding.",
              attempts: attempt,
              attempted: true,
            },
          );
        }
      } catch (error) {
        if (options.signal?.aborted || timeout.aborted) {
          const cancelled =
            options.signal?.aborted &&
            options.signal.reason?.name !== "TimeoutError";
          failure = {
            kind: cancelled ? "cancelled" : "timeout",
            message: cancelled
              ? "File loading was cancelled."
              : options.signal?.aborted
                ? "The overall GitHub download deadline expired."
                : "The GitHub request exceeded its 10-second deadline.",
            attempts: attempt,
            attempted: true,
          };
        } else if (error instanceof ImportError) {
          failure = error.failure ?? {
            kind: error.status === 413 ? "size-limit" : "http",
            message: error.message,
            httpStatus: error.status,
            attempts: attempt,
            attempted: true,
          };
        } else {
          failure = {
            kind: "network",
            message: "A network connection failed while reading GitHub.",
            attempts: attempt,
            attempted: true,
          };
        }
      }
      const retryable =
        ["rate-limit", "network", "timeout"].includes(failure.kind) ||
        (failure.httpStatus ?? 0) >= 500;
      const delay = Math.max(
        1000 * attempt,
        (failure.retryAt ?? now()) - now(),
      );
      // Long GitHub cooldowns are returned to the UI, never shortened to fit this request.
      if (
        !retryable ||
        failure.kind === "invalid-response" ||
        options.signal?.aborted ||
        attempt === maximum ||
        delay > 2000
      ) {
        throw new ImportError(
          failure.message,
          failure.kind === "rate-limit"
            ? 429
            : failure.kind === "cancelled"
              ? 408
              : failure.kind === "timeout"
                ? 504
                : (failure.httpStatus ?? 502),
          failure,
        );
      }
      try {
        await (options.sleep ?? pause)(delay, options.signal);
      } catch {
        const timedOut = options.signal?.reason?.name === "TimeoutError";
        const message = timedOut
          ? "The overall GitHub download deadline expired while waiting to retry."
          : "File loading was cancelled while waiting to retry.";
        throw new ImportError(message, timedOut ? 504 : 408, {
          kind: timedOut ? "timeout" : "cancelled",
          message,
          attempts: attempt,
          attempted: true,
        });
      }
    }
    throw new ImportError("GitHub retry limit reached.", 502);
  };
}
