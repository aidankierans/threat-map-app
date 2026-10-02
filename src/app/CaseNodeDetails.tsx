import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ProseBundle } from "../types.js";
import type { Graph } from "./selectors.js";
import { useDocHistory } from "./history.js";
import { Panel } from "./Panel.js";
export function CaseNodeDetails({ id, graph, prose, onCanvas, onBack }: {
    id: string;
    graph: Graph;
    prose: ProseBundle | null;
    onCanvas: ReadonlySet<string>;
    onBack: () => void;
}) {
    const [selection, setSelection] = useState([id]);
    const nav = useDocHistory({ view: { kind: "tree" }, selection }, doc => setSelection(doc.selection));
    const region = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => { back.current?.focus(); }, []);
    useLayoutEffect(() => { if (region.current)
        region.current.scrollTop = 0; }, [selection]);
    return <div class="case-node-details" ref={region} onClick={e => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                return;
            const anchor = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#/node/"]');
            if (!anchor || anchor.target === "_blank")
                return;
            e.preventDefault();
            setSelection(anchor.hash.slice("#/node/".length).split("?")[0].split("+").map(decodeURIComponent));
        }}>
    <button class="case-back" data-walkthrough="case-back" ref={back} onClick={onBack}>Back to case study</button>
    <Panel graph={graph} prose={prose} selection={selection} nav={nav} onCanvas={onCanvas} onSelect={id => setSelection([id])} onClose={onBack}/>
  </div>;
}
