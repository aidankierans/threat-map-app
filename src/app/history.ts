import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { viewKey, type View } from "./router.js";
export const MAX_HISTORY = 50;
export interface Doc {
    view: View;
    selection: string[];
}
export interface DocHistory {
    entries: Doc[];
    cursor: number;
}
export const EMPTY_HISTORY: DocHistory = { entries: [], cursor: -1 };
function key(doc: Doc): string {
    return `${viewKey(doc.view)}\n${doc.selection.join(" ")}`;
}
export function sameDoc(a: Doc, b: Doc): boolean {
    return key(a) === key(b);
}
function copy(doc: Doc): Doc {
    return { view: { ...doc.view }, selection: [...doc.selection] };
}
export function currentDoc(h: DocHistory): Doc | null {
    return h.entries[h.cursor] ?? null;
}
export function visitDoc(h: DocHistory, doc: Doc): DocHistory {
    const current = currentDoc(h);
    if (current && sameDoc(current, doc))
        return h;
    const entries = h.entries.slice(0, h.cursor + 1);
    entries.push(copy(doc));
    const overflow = Math.max(0, entries.length - MAX_HISTORY);
    return { entries: entries.slice(overflow), cursor: entries.length - overflow - 1 };
}
export function stepDoc(h: DocHistory, delta: -1 | 1): DocHistory | null {
    const cursor = h.cursor + delta;
    if (cursor < 0 || cursor >= h.entries.length)
        return null;
    return { entries: h.entries, cursor };
}
export interface HistoryNav {
    backTarget: Doc | null;
    forwardTarget: Doc | null;
    back: () => void;
    forward: () => void;
}
export function useDocHistory(doc: Doc, show: (doc: Doc) => void): HistoryNav {
    const [history, setHistory] = useState<DocHistory>(EMPTY_HISTORY);
    const latest = useRef(doc);
    latest.current = doc;
    const current = useRef(history);
    current.current = history;
    const docKey = key(doc);
    useEffect(() => {
        setHistory((h) => visitDoc(h, latest.current));
    }, [docKey]);
    const step = useCallback((delta: -1 | 1) => {
        const next = stepDoc(current.current, delta);
        if (!next)
            return;
        current.current = next;
        setHistory(next);
        show(copy(next.entries[next.cursor]!));
    }, [show]);
    const { entries, cursor } = history;
    return {
        backTarget: cursor > 0 ? entries[cursor - 1]! : null,
        forwardTarget: cursor >= 0 && cursor < entries.length - 1 ? entries[cursor + 1]! : null,
        back: useCallback(() => step(-1), [step]),
        forward: useCallback(() => step(1), [step]),
    };
}
