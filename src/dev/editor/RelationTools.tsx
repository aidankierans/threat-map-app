import { useState } from "preact/hooks";
import type { Edge, GraphIndex, IndexNode, LayerName } from "../../types.js";
import { getDoc, putDoc, type EditorContext } from "./api.js";
type Frontmatter = Record<string, unknown>;
export type Patch = {
    set?: Record<string, unknown>;
    unset?: string[];
};
export type PatchResult = {
    patch: Patch;
} | {
    error: string;
};
export function edgeOwner(edge: Edge): string {
    return edge.to;
}
export function edgeCounterpart(edge: Edge): string {
    return edge.from;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export function listAdd(fm: Frontmatter, field: string, id: string): PatchResult {
    const list = asArray<string>(fm[field]);
    if (list.includes(id))
        return { error: `${field} already lists ${id}` };
    return { patch: { set: { [field]: [...list, id] } } };
}
export function listRemove(fm: Frontmatter, field: string, id: string, opts: {
    minOne?: boolean;
} = {}): PatchResult {
    const list = asArray<string>(fm[field]);
    const next = list.filter((x) => x !== id);
    if (next.length === list.length)
        return { error: `${field} does not list ${id}` };
    if (next.length === 0) {
        if (opts.minOne) {
            return {
                error: `removing this would leave ${field} empty — the schema requires at least one, so edit the file directly`,
            };
        }
        return { patch: { unset: [field] } };
    }
    return { patch: { set: { [field]: next } } };
}
export function addEdgePatch(fm: Frontmatter, counterpart: string): PatchResult {
    const groups = asArray<{
        all: string[];
    }>(fm.enabled_by);
    if (groups.some((g) => g.all.length === 1 && g.all[0] === counterpart)) {
        return { error: `a group requiring only ${counterpart} already exists` };
    }
    return { patch: { set: { enabled_by: [...groups, { all: [counterpart] }] } } };
}
export function removeEdgePatch(edge: Edge, fm: Frontmatter): PatchResult {
    const counterpart = edgeCounterpart(edge);
    const groups = asArray<{
        all: string[];
    }>(fm.enabled_by);
    const next = groups
        .map((g) => ({ ...g, all: g.all.filter((a) => a !== counterpart) }))
        .filter((g) => g.all.length > 0);
    if (JSON.stringify(next) === JSON.stringify(groups)) {
        return { error: `no requirement on ${counterpart} declared` };
    }
    if (next.length === 0) {
        return {
            error: "removing this would leave no requirement groups — the schema requires at least one, so edit the file directly",
        };
    }
    return { patch: { set: { enabled_by: next } } };
}
export interface RelationOption {
    key: string;
    label: string;
    pickLayer: LayerName;
    selfOwns: boolean;
}
export function relationOptions(layer: string, legality: GraphIndex["gateMembers"]): RelationOption[] {
    const label = (l: string) => (l === "failure-mode" ? "failure mode" : l);
    const options: RelationOption[] = [];
    for (const member of legality[layer] ?? []) {
        options.push({
            key: `by-${member}`,
            label: `enabled by ← ${label(member)} (new OR group)`,
            pickLayer: member,
            selfOwns: true,
        });
    }
    for (const [gated, members] of Object.entries(legality)) {
        if (!members.includes(layer as LayerName))
            continue;
        options.push({
            key: `to-${gated}`,
            label: `enables → ${label(gated)} (new OR group)`,
            pickLayer: gated as LayerName,
            selfOwns: false,
        });
    }
    return options;
}
async function applyDocPatch(ctx: EditorContext, ownerId: string, compute: (fm: Frontmatter) => PatchResult): Promise<string[]> {
    try {
        const doc = await getDoc(ctx, ownerId);
        const result = compute(doc.frontmatter);
        if ("error" in result)
            return [result.error];
        const saved = await putDoc(ctx, { id: ownerId, baseHash: doc.hash, ...result.patch });
        if ("conflict" in saved)
            return [`${ownerId} changed on disk — try again`];
        if (saved.outcome === "drafted")
            return saved.errors.map((e) => `not applied — ${e}`);
        return saved.errors;
    }
    catch (err) {
        return [`could not update ${ownerId}: ${(err as Error).message}`];
    }
}
function Strip({ lines }: {
    lines: string[];
}) {
    if (!lines.length)
        return null;
    return (<div class="edt-strip">
      {lines.map((line) => (<div key={line}>✗ {line}</div>))}
    </div>);
}
export function RelationAdder({ node, ctx }: {
    node: IndexNode;
    ctx: EditorContext;
}) {
    const options = relationOptions(node.layer, ctx.index.gateMembers);
    const [optKey, setOptKey] = useState(options[0]?.key ?? "");
    const [target, setTarget] = useState("");
    const [busy, setBusy] = useState(false);
    const [strip, setStrip] = useState<string[]>([]);
    if (options.length === 0)
        return <></>;
    const opt = options.find((o) => o.key === optKey) ?? options[0];
    const candidates = ctx.index.nodes
        .filter((n) => n.layer === opt.pickLayer && n.id !== node.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    const add = async () => {
        if (!target)
            return;
        setBusy(true);
        const owner = opt.selfOwns ? node.id : target;
        const counterpart = opt.selfOwns ? target : node.id;
        setStrip(await applyDocPatch(ctx, owner, (fm) => addEdgePatch(fm, counterpart)));
        setBusy(false);
    };
    return (<div class="edt-reltools">
      <span class="edt-reltools-label">add relation:</span>
      <select value={opt.key} onChange={(e) => {
            setOptKey(e.currentTarget.value);
            setTarget("");
            setStrip([]);
        }}>
        {options.map((o) => (<option key={o.key} value={o.key}>
            {o.label}
          </option>))}
      </select>
      <select value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
        <option value="">— pick —</option>
        {candidates.map((n) => (<option key={n.id} value={n.id}>
            {n.id} — {n.label}
          </option>))}
      </select>
      <button class="edt-btn" disabled={busy || !target} onClick={() => void add()}>
        add
      </button>
      <Strip lines={strip}/>
    </div>);
}
export function EdgeRemover({ edge, id, documented, ctx, }: {
    edge: Edge;
    id: string;
    documented: boolean;
    ctx: EditorContext;
}) {
    const [busy, setBusy] = useState(false);
    const [strip, setStrip] = useState<string[]>([]);
    const remove = async () => {
        const warning = documented
            ? `Remove ${id}?\n\nThis relation has an argument file (content/edges/${id}.md). Removing the relation orphans it, and the build will flag that file until it is deleted too.`
            : `Remove ${id}?\n\nThis deletes the declaration from ${edgeOwner(edge)}'s frontmatter.`;
        if (!window.confirm(warning))
            return;
        setBusy(true);
        setStrip(await applyDocPatch(ctx, edgeOwner(edge), (fm) => removeEdgePatch(edge, fm)));
        setBusy(false);
    };
    return (<div class="edt-reltools">
      <button class="edt-btn" disabled={busy} onClick={() => void remove()}>
        remove relation
      </button>
      <Strip lines={strip}/>
    </div>);
}
export function QuestionLinker({ node, ctx }: {
    node: IndexNode;
    ctx: EditorContext;
}) {
    const [busy, setBusy] = useState(false);
    const [pick, setPick] = useState("");
    const [strip, setStrip] = useState<string[]>([]);
    const questions = ctx.index.questions;
    const linked = questions.filter((q) => q.addresses.includes(node.id));
    const unlinked = questions.filter((q) => !q.addresses.includes(node.id));
    const patch = async (qid: string, compute: (fm: Frontmatter) => PatchResult) => {
        setBusy(true);
        setStrip(await applyDocPatch(ctx, qid, compute));
        setBusy(false);
    };
    return (<>
      {linked.length > 0 && (<>
          <h3>Open questions that would settle this</h3>
          <ul>
            {linked.map((q) => (<li key={q.id}>
                <a href={`#/questions`}>{q.label}</a>{" "}
                <button class="edt-btn" title={`Unlink — removes ${node.id} from ${q.id}'s addresses`} disabled={busy} onClick={() => void patch(q.id, (fm) => listRemove(fm, "addresses", node.id))}>
                  unlink
                </button>
              </li>))}
          </ul>
        </>)}
      {unlinked.length > 0 && (<div class="edt-reltools">
          <span class="edt-reltools-label">link a question:</span>
          <select value={pick} onChange={(e) => setPick(e.currentTarget.value)}>
            <option value="">— pick —</option>
            {unlinked.map((q) => (<option key={q.id} value={q.id}>
                {q.label}
              </option>))}
          </select>
          <button class="edt-btn" disabled={busy || !pick} onClick={() => {
                void patch(pick, (fm) => listAdd(fm, "addresses", node.id));
                setPick("");
            }}>
            link
          </button>
        </div>)}
      <Strip lines={strip}/>
    </>);
}
