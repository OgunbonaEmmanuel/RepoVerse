import { boundedBytes, importGitHub, ImportError } from "../../../lib/github";
export const runtime = "nodejs";
let importing = false;
export async function POST(request: Request) {
  if (importing)
    return Response.json(
      { error: "An import is already running on this server. Retry shortly." },
      { status: 429 },
    );
  importing = true;
  try {
    const data = JSON.parse(
      new TextDecoder().decode(
        await boundedBytes(
          new Response(request.body),
          1024,
          AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
        ),
      ),
    ) as { url?: unknown };
    if (!data || typeof data !== "object")
      throw new ImportError("Request must contain a repository URL.");
    const graph = await importGitHub(data.url, {
      signal: request.signal,
      token: process.env.GITHUB_TOKEN,
    });
    return Response.json(graph, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        failure: error instanceof ImportError ? error.failure : undefined,
        error:
          error instanceof ImportError
            ? error.message
            : error instanceof SyntaxError
              ? "Invalid JSON request."
              : "Import failed. Check the repository URL and retry.",
      },
      {
        status:
          error instanceof ImportError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 502,
      },
    );
  } finally {
    importing = false;
  }
}
