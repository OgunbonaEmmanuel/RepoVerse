import { boundedBytes } from "../../../lib/github-transport";
import { ExplanationError } from "../../../lib/explanation-input";
import { explainFile } from "../../../lib/explanation-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      throw new ExplanationError(
        "Explanation requests must come from this app.",
        403,
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ExplanationError("Expected a JSON explanation request.", 415);
    const raw = await boundedBytes(
      new Response(request.body),
      768 * 1024,
      AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
    );
    const input: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
    const result = await explainFile(input, {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ExplanationError
            ? error.message
            : "Unable to read the explanation request. Check its size and retry.",
      },
      {
        status: error instanceof ExplanationError ? error.status : 400,
        headers,
      },
    );
  }
}
