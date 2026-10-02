import type { Doc, HistoryNav } from "./history.js";
import { viewLabel } from "./router.js";
import { bandDetailOf, gateGroupOf, type Graph } from "./selectors.js";
function describeDoc(graph: Graph, doc: Doc): string {
    if (doc.view.kind !== "tree")
        return viewLabel(doc.view, graph.index.pages);
    if (doc.selection.length === 0)
        return "overview";
    if (doc.selection.length > 1)
        return `${doc.selection.length} items`;
    const id = doc.selection[0]!;
    const band = bandDetailOf(graph, id);
    if (band)
        return band.label;
    const gate = gateGroupOf(graph, id);
    if (gate) {
        const gated = graph.byId.get(gate.gatedId);
        return `${gate.members.length}-way AND · ${gate.gatedId}${gated ? ` · ${gated.label}` : ""}`;
    }
    const label = graph.byId.get(id)?.label ?? graph.index.edgeDocs[id]?.label;
    return `${id}${label ? ` · ${label}` : ""}`;
}
export function DocHistoryButtons({ graph, nav }: {
    graph: Graph;
    nav: HistoryNav;
}) {
    const describe = (entry: Doc | null, direction: "Previous" | "Next") => entry
        ? `${direction} doc — ${describeDoc(graph, entry)}`
        : `No ${direction.toLowerCase()} doc`;
    return (<nav class="dochistory">
      <button class="histbtn" onClick={nav.back} disabled={!nav.backTarget} title={describe(nav.backTarget, "Previous")} aria-label="Previous doc">
        ←
      </button>
      <button class="histbtn" onClick={nav.forward} disabled={!nav.forwardTarget} title={describe(nav.forwardTarget, "Next")} aria-label="Next doc">
        →
      </button>
    </nav>);
}
