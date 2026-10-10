import { boundedBytes, ImportError } from "../../../lib/github-transport";
import { retrySourceFile } from "../../../lib/file-recovery";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const data: unknown = JSON.parse(
      new TextDecoder().decode(
        await boundedBytes(
          new Response(request.body),
          8192,
          AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
        ),
      ),
    );
    const result = await retrySourceFile(data, {
      signal: request.signal,
      token: process.env.GITHUB_TOKEN,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = error instanceof ImportError ? error.failure : undefined;
    return Response.json(
      {
        error:
          error instanceof ImportError
            ? error.message
            : "Unable to retry this file.",
        failure,
        retriesRemaining: (error as { retriesRemaining?: number })
          ?.retriesRemaining,
      },
      {
        status: error instanceof ImportError ? error.status : 400,
        headers: {
          "Cache-Control": "no-store",
          ...(failure?.retryAt
            ? {
                "Retry-After": String(
                  Math.max(1, Math.ceil((failure.retryAt - Date.now()) / 1000)),
                ),
              }
            : {}),
        },
      },
    );
  }
}
