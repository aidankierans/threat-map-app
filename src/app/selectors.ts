import type { Edge, Gate, GroupIndex, EvidenceBucket, GraphIndex, IndexNode, LayerConfig, Status, } from "../types.js";
import { edgeId, isEdgeId } from "../edge-id.js";
import { isGateId, parseGateId } from "../gate-id.js";
import { scaleSatisfiers } from "../scale.js";
import type { StoryMode } from "./story.js";
import { affordanceFamily, displayGroupOf, DISPLAY_FAMILIES, type DisplayGroup } from "./display-groups.js";
export const SEED_LAYERS = ["component", "stage"];
export interface Graph {
    index: GraphIndex;
    byId: Map<string, IndexNode>;
    edgeById: Map<string, Edge>;
    outgoing: Map<string, string[]>;
    incoming: Map<string, string[]>;
    edgesFrom: Map<string, Edge[]>;
    edgesTo: Map<string, Edge[]>;
    columns: IndexNode[][];
    drawn: Set<string>;
    columnOf: Map<string, number>;
    hueOf: Map<string, string>;
    fold?: FoldMap;
}
export interface FoldMap {
    of: Map<string, string>;
    members: Map<string, string[]>;
    edges: Map<string, string[]>;
}
export function groupKeyOf(node: IndexNode): string | undefined {
    return node.fold?.key ?? node.phase ?? node.group ?? (node.layer === "affordance" ? affordanceFamily(node.id) : undefined);
}
export function isLayer(node: IndexNode | undefined, ...names: string[]): boolean {
    return !!node && names.includes(node.layer);
}
export function spineRoots(g: Graph): IndexNode[] {
    return g.index.nodes.filter((n) => g.drawn.has(n.id) && SEED_LAYERS.includes(n.layer));
}
export function spineOrder(index: GraphIndex, arrangement?: readonly string[]): LayerConfig[] {
    const spine = index.layers.filter((l) => l.role === "spine");
    if (!arrangement?.length)
        return spine;
    const wanted = arrangement.filter((name, i) => arrangement.indexOf(name) === i);
    const rank = (l: LayerConfig) => {
        const i = wanted.indexOf(l.name);
        return i < 0 ? wanted.length + spine.indexOf(l) : i;
    };
    return [...spine].sort((a, b) => rank(a) - rank(b));
}
export function isDefaultOrder(index: GraphIndex, arrangement?: readonly string[]): boolean {
    const declared = index.layers.filter((l) => l.role === "spine");
    return spineOrder(index, arrangement).every((l, i) => l === declared[i]);
}
export function moveColumn(order: readonly string[], from: number, to: number): string[] {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (moved === undefined)
        return next;
    next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
    return next;
}
export function buildGraph(index: GraphIndex, arrangement?: readonly string[], keep?: (node: IndexNode) => boolean): Graph {
    const nodes = keep ? index.nodes.filter(keep) : index.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edgeById = new Map<string, Edge>();
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    const edgesFrom = new Map<string, Edge[]>();
    const edgesTo = new Map<string, Edge[]>();
    const push = (m: Map<string, string[]>, k: string, v: string) => {
        if (!m.has(k))
            m.set(k, []);
        m.get(k)!.push(v);
    };
    for (const e of index.edges) {
        if (!byId.has(e.from) || !byId.has(e.to))
            continue;
        edgeById.set(edgeId(e.from, e.to), e);
        push(outgoing, e.from, e.to);
        push(incoming, e.to, e.from);
        if (!edgesFrom.has(e.from))
            edgesFrom.set(e.from, []);
        if (!edgesTo.has(e.to))
            edgesTo.set(e.to, []);
        edgesFrom.get(e.from)!.push(e);
        edgesTo.get(e.to)!.push(e);
    }
    const spine = spineOrder(index, arrangement);
    const columnOf = new Map(spine.map((l, i) => [l.name as string, i]));
    const touched = new Set<string>([...outgoing.keys(), ...incoming.keys()]);
    const live = new Set<string>();
    const banded = new Set<string>();
    for (const n of nodes) {
        const key = columnOf.has(n.layer) ? groupKeyOf(n) : undefined;
        if (key === undefined)
            continue;
        banded.add(key);
        if (touched.has(n.id))
            live.add(key);
    }
    const silent = new Set([...banded].filter((key) => !live.has(key)));
    const columns: IndexNode[][] = Array.from({ length: spine.length }, () => []);
    const drawn = new Set<string>();
    for (const n of nodes) {
        const col = columnOf.get(n.layer);
        if (col === undefined)
            continue;
        const key = groupKeyOf(n);
        if (key !== undefined && silent.has(key))
            continue;
        columns[col]!.push(n);
        drawn.add(n.id);
    }
    const hueOf = new Map(index.layers.map((l) => [l.name as string, l.hue]));
    return {
        index,
        byId,
        edgeById,
        outgoing,
        incoming,
        edgesFrom,
        edgesTo,
        columns,
        drawn,
        columnOf,
        hueOf,
    };
}
export function runsAgainstOrder(g: Graph, edge: Edge): boolean {
    const from = g.byId.get(edge.from);
    const to = g.byId.get(edge.to);
    if (!from || !to)
        return false;
    const a = g.columnOf.get(from.layer);
    const b = g.columnOf.get(to.layer);
    if (a === undefined || b === undefined)
        return false;
    return a >= b;
}
export function componentBands(index: GraphIndex): GroupIndex[] {
    return index.groups.filter((g) => g.layer === "component");
}
export function conditionBands(index: GraphIndex): GroupIndex[] {
    return index.groups.filter((g) => g.layer === "condition-group");
}
export function gateReachable(g: Graph, allow: (id: string) => boolean = () => true, options: {
    skipPartial?: boolean;
} = {}): Set<string> {
    const satisfiers = scaleSatisfiers(g.index.groups);
    const holds = (member: string, reached: ReadonlySet<string>) => satisfiers(member).some((id) => reached.has(id));
    const usable = (group: {
        all: string[];
        partial?: boolean;
    }) => !(options.skipPartial && group.partial);
    const reached = new Set<string>();
    for (const n of g.index.nodes) {
        if (SEED_LAYERS.includes(n.layer) && g.drawn.has(n.id) && allow(n.id))
            reached.add(n.id);
    }
    for (let changed = true; changed;) {
        changed = false;
        for (const n of g.index.nodes) {
            if (reached.has(n.id) || SEED_LAYERS.includes(n.layer) || !allow(n.id))
                continue;
            const gate = g.index.gates[n.id];
            if (!gate?.length)
                continue;
            if (!gate.some((group) => usable(group) && group.all.every((m) => holds(m, reached))))
                continue;
            reached.add(n.id);
            changed = true;
        }
    }
    return reached;
}
export function reachableFrom(g: Graph, ids: Iterable<string>): Set<string> {
    return walkThrough(g.outgoing, ids, () => true);
}
export function reachableTo(g: Graph, ids: Iterable<string>): Set<string> {
    return walkThrough(g.incoming, ids, () => true);
}
export function relatedTo(g: Graph, ids: Iterable<string>): Set<string> {
    return new Set(relatedDistance(g, ids).dist.keys());
}
export interface DistanceOptions {
    maxHops?: number;
    allow?: (id: string) => boolean;
}
export interface Related {
    down: ReadonlyMap<string, number>;
    up: ReadonlyMap<string, number>;
    dist: ReadonlyMap<string, number>;
}
const DEFAULT_MAX_HOPS = 12;
function bfs(adjacency: Map<string, string[]>, seeds: Iterable<string>, maxHops: number, allow: (id: string) => boolean): Map<string, number> {
    const dist = new Map<string, number>();
    let frontier: string[] = [];
    for (const id of seeds) {
        if (!allow(id) || dist.has(id))
            continue;
        dist.set(id, 0);
        frontier.push(id);
    }
    for (let d = 1; d <= maxHops && frontier.length; d++) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const to of adjacency.get(id) ?? []) {
                if (dist.has(to) || !allow(to))
                    continue;
                dist.set(to, d);
                next.push(to);
            }
        }
        frontier = next;
    }
    return dist;
}
export function relatedDistance(g: Graph, ids: Iterable<string>, options: DistanceOptions = {}): Related {
    const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
    const allow = options.allow ?? (() => true);
    const seeds = [...ids].flatMap((id) => endpointsOf(g, id)).filter(allow);
    const down = bfs(g.outgoing, seeds, maxHops, allow);
    const up = bfs(g.incoming, seeds, maxHops, allow);
    const dist = new Map<string, number>();
    const relax = (id: string, d: number) => {
        const prior = dist.get(id);
        if (prior === undefined || d < prior)
            dist.set(id, d);
    };
    for (const [id, d] of down)
        relax(id, d);
    for (const [id, d] of up)
        relax(id, d);
    return { down, up, dist };
}
function walkThrough(adjacency: Map<string, string[]>, starts: Iterable<string>, allow: (id: string) => boolean): Set<string> {
    const seen = new Set<string>();
    const stack: string[] = [];
    for (const id of starts) {
        if (allow(id)) {
            seen.add(id);
            stack.push(id);
        }
    }
    while (stack.length) {
        for (const next of adjacency.get(stack.pop()!) ?? []) {
            if (!seen.has(next) && allow(next)) {
                seen.add(next);
                stack.push(next);
            }
        }
    }
    return seen;
}
export function reachThrough(g: Graph, starts: Iterable<string>, allow: (id: string) => boolean): Set<string> {
    return walkThrough(g.outgoing, starts, allow);
}
export function relatedThrough(g: Graph, seeds: Iterable<string>, allow: (id: string) => boolean): Set<string> {
    const set = walkThrough(g.outgoing, seeds, allow);
    for (const id of walkThrough(g.incoming, seeds, allow))
        set.add(id);
    return set;
}
export function gatesOf(g: Graph, gatedId: string): Gate {
    return g.index.gates[gatedId] ?? [];
}
export function gateSatisfied(gate: Gate, held: ReadonlySet<string>): boolean {
    return gate.some((group) => !group.partial && group.all.length > 0 && group.all.every((a) => held.has(a)));
}
export type HiddenMode = "applied" | "shape" | "held";
export interface HiddenSet {
    ids: string[];
    mode: HiddenMode;
}
export interface FilterState {
    bucket: EvidenceBucket[] | null;
    hidden: HiddenSet[];
    showPartialGates: boolean;
    story: StoryMode | null;
    query: string;
    fold: FoldState;
}
export interface FoldState {
    all: boolean;
    except: string[];
}
export const FOLD_ALL: FoldState = { all: true, except: [] };
export const FOLD_NONE: FoldState = { all: false, except: [] };
export const DEFAULT_FILTERS: FilterState = {
    bucket: null,
    hidden: [],
    showPartialGates: false,
    story: null,
    query: "",
    fold: FOLD_ALL,
};
export function isFolded(fold: FoldState, key: string): boolean {
    return fold.all !== fold.except.includes(key);
}
export function toggleFold(fold: FoldState, key: string): FoldState {
    const family = DISPLAY_FAMILIES.find(f => f.id === key && f.layer === "condition");
    if (family && fold.all) {
        const closed = isFolded(fold, key) && !family.members.some(child => fold.except.includes(child));
        return { all: true, except: closed ? [...fold.except, key] : fold.except.filter(k => k !== key && !family.members.includes(k)) };
    }
    return {
        all: fold.all,
        except: fold.except.includes(key)
            ? fold.except.filter((k) => k !== key)
            : [...fold.except, key],
    };
}
export function sameFold(a: FoldState, b: FoldState): boolean {
    return (a.all === b.all &&
        a.except.length === b.except.length &&
        a.except.every((k) => b.except.includes(k)));
}
export function expandSet(g: Graph, ids: readonly string[]): string[] {
    const bands = new Map(g.index.groups.map((band) => [band.id, band.members]));
    const phases = new Set<string>(g.index.taxonomies.phase?.order ?? []);
    const out: string[] = [];
    for (const id of ids) {
        const band = bands.get(id);
        if (band) {
            out.push(...band);
        }
        else if (phases.has(id)) {
            for (const n of g.index.nodes)
                if (n.phase === id)
                    out.push(n.id);
        }
        else {
            out.push(id);
        }
    }
    return out;
}
export function hiddenNodes(g: Graph, f: FilterState): Set<string> {
    return new Set(f.hidden.filter((s) => s.mode === "applied").flatMap((s) => expandSet(g, s.ids)));
}
export function shapeOnlyNodes(g: Graph, f: FilterState): Set<string> {
    return new Set(f.hidden.filter((s) => s.mode === "shape").flatMap((s) => expandSet(g, s.ids)));
}
export function heldNodes(g: Graph, f: FilterState): Set<string> {
    const gone = hiddenNodes(g, f);
    const shaped = shapeOnlyNodes(g, f);
    return new Set(f.hidden
        .filter((s) => s.mode === "held")
        .flatMap((s) => expandSet(g, s.ids))
        .filter((id) => !gone.has(id) && !shaped.has(id)));
}
export function hasActiveFilters(f: FilterState): boolean {
    return (f.hidden.length > 0 ||
        f.showPartialGates ||
        f.story !== null ||
        f.query.trim().length > 0 ||
        !sameFold(f.fold, DEFAULT_FILTERS.fold));
}
export function matchesQuery(node: IndexNode, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q)
        return true;
    const haystack = `${node.id} ${node.tag} ${node.label} ${node.lead}`.toLowerCase();
    return haystack.includes(q);
}
export function passesFilters(g: Graph, node: IndexNode, f: FilterState): boolean {
    if (f.hidden.some((set) => set.mode !== "held" && expandSet(g, set.ids).includes(node.id))) {
        return false;
    }
    if (!matchesQuery(node, f.query))
        return false;
    return true;
}
export function structuralNodes(g: Graph, f: FilterState): Set<string> {
    const structural = { ...f, query: "" };
    const passes = new Map<string, boolean>();
    for (const n of g.index.nodes)
        passes.set(n.id, passesFilters(g, n, structural));
    const shaped = shapeOnlyNodes(g, f);
    const forTheWalk = {
        ...structural,
        hidden: structural.hidden.filter((set) => set.mode !== "shape"),
    };
    const walkPasses = new Map<string, boolean>();
    for (const n of g.index.nodes) {
        walkPasses.set(n.id, shaped.has(n.id) ? passesFilters(g, n, forTheWalk) : passes.get(n.id)!);
    }
    const reached = gateReachable(g, (id) => walkPasses.get(id) === true);
    for (const id of reached)
        if (!passes.get(id))
            reached.delete(id);
    return reached;
}
function narrowToQuery(g: Graph, ids: Set<string>, query: string): Set<string> {
    if (!query.trim())
        return ids;
    return new Set([...ids].filter((id) => matchesQuery(g.byId.get(id)!, query)));
}
export function searchNodes(g: Graph, query: string): Set<string> {
    return narrowToQuery(g, new Set(g.drawn), query);
}
export function searchHits(g: Graph, query: string): Set<string> {
    if (!query.trim())
        return new Set();
    return narrowToQuery(g, new Set(g.drawn), query);
}
export function visibleNodes(g: Graph, f: FilterState): Set<string> {
    return narrowToQuery(g, structuralNodes(g, f), f.query);
}
export interface StageImpact {
    enabled: IndexNode[];
    contributing: IndexNode[];
    events: IndexNode[];
    consequenceClasses: GroupIndex[];
    actClasses: {
        group: GroupIndex;
        members: IndexNode[];
    }[];
}
export function stageImpact(g: Graph, stageId: string): StageImpact {
    const held = new Set((g.edgesFrom.get(stageId) ?? [])
        .map((e) => e.to)
        .filter((id) => isLayer(g.byId.get(id), "affordance")));
    const background = new Set(g.index.nodes.filter((n) => isLayer(n, "component", "condition")).map((n) => n.id));
    const satisfied = (id: string) => held.has(id) || background.has(id);
    const enabled: IndexNode[] = [];
    const contributing: IndexNode[] = [];
    for (const node of g.index.nodes) {
        if (!isLayer(node, "failure-mode"))
            continue;
        const touches = (g.incoming.get(node.id) ?? []).some((a) => held.has(a));
        if (!touches)
            continue;
        const gate = gatesOf(g, node.id);
        const complete = gate.some((group) => !group.partial && group.all.length > 0 && group.all.every(satisfied));
        if (complete)
            enabled.push(node);
        else
            contributing.push(node);
    }
    const cone = reachableFrom(g, enabled.map((n) => n.id));
    const events = [...cone]
        .map((id) => g.byId.get(id))
        .filter((n): n is IndexNode => isLayer(n, "event"))
        .sort((a, b) => a.id.localeCompare(b.id));
    enabled.sort((a, b) => a.label.localeCompare(b.label));
    return {
        enabled,
        contributing: contributing.sort((a, b) => a.label.localeCompare(b.label)),
        events,
        consequenceClasses: g.index.groups
            .filter((gr) => gr.layer === "consequence")
            .filter((gr) => events.some((e) => gr.members.includes(e.id)))
            .sort((a, b) => a.order - b.order),
        actClasses: g.index.groups
            .filter((gr) => gr.layer === "act-class")
            .sort((a, b) => a.order - b.order)
            .map((group) => ({
            group,
            members: enabled.filter((n) => group.members.includes(n.id)),
        }))
            .filter((entry) => entry.members.length > 0),
    };
}
export function questionsFor(g: Graph, nodeId: string) {
    return g.index.questions.filter((q) => q.addresses.includes(nodeId));
}
export function componentsFor(g: Graph, nodeId: string) {
    return g.index.components.filter((c) => c.mapsTo.includes(nodeId));
}
export function statusLabel(doc: {
    status: Status;
    needsCitation: boolean;
}): string {
    return doc.status;
}
export function coverageGaps(node: IndexNode): string {
    const gaps: string[] = [];
    if (node.status === "draft")
        gaps.push("draft");
    return gaps.join(" · ");
}
export function gateGroupOf(g: Graph, id: string): {
    gatedId: string;
    group: number;
    members: string[];
    note?: string;
} | undefined {
    const parsed = parseGateId(id);
    if (!parsed)
        return undefined;
    const found = g.index.gates[parsed.gatedId]?.[parsed.group];
    if (!found || found.all.length < 2)
        return undefined;
    return { ...parsed, members: found.all, note: found.note };
}
export function bandDetailOf(g: Graph, id: string): (Pick<GroupIndex, "id" | "label" | "lead" | "members"> & Partial<Pick<GroupIndex, "kind" | "subject" | "source">> & Partial<Pick<DisplayGroup, "children" | "displayOnly">>) | undefined {
    if (!id.startsWith("group:"))
        return undefined;
    const key = id.slice("group:".length);
    const group = g.index.groups.find((entry) => entry.id === key);
    if (group)
        return group;
    const family = displayGroupOf(g.index, key);
    if (family)
        return family;
    const phase = g.index.taxonomies.phase?.values[key];
    if (!phase)
        return undefined;
    return {
        id: key,
        label: phase.label,
        lead: phase.description ?? "",
        members: g.index.nodes.filter((node) => node.phase === key).map((node) => node.id),
    };
}
export function resolveId(g: Graph, id: string): string | undefined {
    if (id.startsWith("group:"))
        return bandDetailOf(g, id) ? id : undefined;
    if (isEdgeId(id))
        return g.edgeById.has(id) ? id : undefined;
    if (isGateId(id))
        return gateGroupOf(g, id) ? id : undefined;
    return g.byId.has(id) ? id : undefined;
}
export function endpointsOf(g: Graph, id: string): string[] {
    if (id.startsWith("group:"))
        return [];
    const edge = g.edgeById.get(id);
    if (edge)
        return [edge.from, edge.to];
    const gate = gateGroupOf(g, id);
    return gate ? [gate.gatedId, ...gate.members] : [id];
}
export function resolveSelection(g: Graph, ids: readonly string[]): string[] {
    const out: string[] = [];
    for (const raw of ids) {
        const id = resolveId(g, raw);
        if (id && !out.includes(id))
            out.push(id);
    }
    return out;
}
