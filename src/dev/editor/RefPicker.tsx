import type { Completions } from "./api.js";
export type TriggerKind = "node" | "ref";
export interface Trigger {
    kind: TriggerKind;
    query: string;
    start: number;
}
export function detectTrigger(text: string, caret: number): Trigger | null {
    const before = text.slice(0, caret);
    const node = before.match(/\[\[([A-Za-z0-9-]*)$/);
    if (node)
        return { kind: "node", query: node[1], start: caret - node[1].length - 2 };
    const ref = before.match(/\[@([^\]\n]*)$/);
    if (ref) {
        const fragment = ref[1].split(";").pop()!.replace(/^\s*@?/, "");
        return { kind: "ref", query: fragment, start: caret - fragment.length };
    }
    return null;
}
export interface Candidate {
    value: string;
    detail: string;
    kicker: string;
}
export function candidatesFor(trigger: Trigger, data: Completions, limit = 8): Candidate[] {
    const q = trigger.query.toLowerCase();
    const pool: Candidate[] = trigger.kind === "node"
        ? data.nodes.map((n) => ({ value: n.id, detail: n.label, kicker: n.layer }))
        : data.refs.map((r) => ({ value: r.key, detail: r.title, kicker: "ref" }));
    const rank = (c: Candidate): number => {
        const value = c.value.toLowerCase();
        const detail = c.detail.toLowerCase();
        if (value.startsWith(q))
            return 0;
        if (value.includes(q))
            return 1;
        if (detail.includes(q))
            return 2;
        return 3;
    };
    return pool
        .map((c) => ({ c, r: rank(c) }))
        .filter(({ r }) => q === "" || r < 3)
        .sort((a, b) => a.r - b.r || a.c.value.localeCompare(b.c.value))
        .slice(0, limit)
        .map(({ c }) => c);
}
export interface Insertion {
    start: number;
    end: number;
    text: string;
}
export function buildInsertion(trigger: Trigger, chosen: string, text: string, caret: number): Insertion {
    if (trigger.kind === "node") {
        const closed = text.slice(caret).startsWith("]]");
        return { start: trigger.start, end: caret, text: `[[${chosen}]]`.slice(0, closed ? -2 : undefined) };
    }
    const first = text.slice(trigger.start - 2, trigger.start) === "[@";
    const closed = text.slice(caret).startsWith("]");
    const completion = `${first ? "" : "@"}${chosen}${closed ? "" : "]"}`;
    return { start: trigger.start, end: caret, text: completion };
}
export function applyInsertion(el: HTMLTextAreaElement, ins: Insertion): void {
    el.focus();
    el.setSelectionRange(ins.start, ins.end);
    const native = typeof document.execCommand === "function" && document.execCommand("insertText", false, ins.text);
    if (!native) {
        el.setRangeText(ins.text, ins.start, ins.end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }
}
export function Picker({ candidates, selected, onPick, }: {
    candidates: Candidate[];
    selected: number;
    onPick: (c: Candidate) => void;
}) {
    if (!candidates.length)
        return null;
    return (<ul class="edt-picker" role="listbox">
      {candidates.map((c, i) => (<li key={c.value} role="option" aria-selected={i === selected ? "true" : "false"} class={i === selected ? "sel" : undefined} onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
            }}>
          <span class="edt-picker-value">{c.value}</span>
          <span class="edt-picker-detail">{c.detail}</span>
          <span class="edt-picker-kicker">{c.kicker}</span>
        </li>))}
    </ul>);
}
