import Explorer from "../components/Explorer";
import { demoGraph } from "../lib/demo";
export default function Page() {
  return <Explorer initial={demoGraph()} />;
}
