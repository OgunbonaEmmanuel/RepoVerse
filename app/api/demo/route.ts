import { demoGraph } from "../../../lib/demo";
export function GET() {
  return Response.json(demoGraph());
}
