import type { Edge, FoldInfo, Gate, GraphIndex, IndexNode } from "../types.js";
import { edgeId, parseEdgeId } from "../edge-id.js";
import { parseGateId } from "../gate-id.js";
import { DISPLAY_FAMILIES, conditionFamily, displayFamilyOf, displayGroupOf } from "./display-groups.js";
import { buildGraph, groupKeyOf, isFolded, type FoldMap, type FoldState, type Graph, } from "./selectors.js";
export type { FoldMap };
export const FOLD_PREFIX = "fold:";
export const GROUP_PREFIX = "group:";
export function foldId(key: string): string {
    return `${FOLD_PREFIX}${key}`;
}
export function isFoldId(id: string): boolean {
    return id.startsWith(FOLD_PREFIX);
}
export function foldKeyOf(id: string): string | undefined {
    return isFoldId(id) ? id.slice(FOLD_PREFIX.length) : undefined;
}
export function foldedKeys(g: Graph, fold: FoldState, open: Iterable<string> = []): Set<string> {
    const held = new Set(open);
    const out = new Set<string>();
    const closedParents = new Set(DISPLAY_FAMILIES.filter(family => family.layer === "condition" &&
        isFolded(fold, family.id) && !held.has(family.id) &&
        !family.members.some(child => held.has(child) || (fold.all && fold.except.includes(child))))
        .map(family => family.id));
    for (const n of g.index.nodes) {
        if (!g.drawn.has(n.id))
            continue;
        const parent = n.layer === "condition" ? conditionFamily(n.group) : undefined;
        const key = parent && closedParents.has(parent) ? parent : groupKeyOf(n);
        if (key !== undefined && !held.has(key) && isFolded(fold, key))
            out.add(key);
    }
    return out;
}
export function bandsOf(g: Graph, ids: Iterable<string>): Set<string> {
    const out = new Set<string>();
    for (const id of ids) {
        const node = g.byId.get(id);
        const key = node ? groupKeyOf(node) : undefined;
        if (key !== undefined)
            out.add(key);
        const family = node && displayFamilyOf(node);
        if (family)
            out.add(family);
    }
    return out;
}
function bandHeading(g: Graph, key: string, layer: string): {
    heading: string;
    noun: string;
} {
    const group = g.index.groups.find((entry) => entry.id === key) ?? displayGroupOf(g.index, key);
    const phase = group ? undefined : g.index.taxonomies.phase?.values[key];
    const heading = group ? ("short" in group ? group.short ?? group.label : group.label) : `${key} · ${phase?.label ?? key}`;
    const noun = (g.index.layers.find((l) => l.name === layer)?.label ?? layer).toLowerCase();
    return { heading, noun };
}
export function foldGraph(view: Graph, folded: ReadonlySet<string>, arrangement?: readonly string[]): Graph {
    if (folded.size === 0)
        return view;
    const of = new Map<string, string>();
    const members = new Map<string, string[]>();
    const foldKey = (node: IndexNode) => {
        const family = displayFamilyOf(node);
        return family && folded.has(family) ? family : groupKeyOf(node);
    };
    for (const n of view.index.nodes) {
        if (!view.drawn.has(n.id))
            continue;
        const key = foldKey(n);
        if (key === undefined || !folded.has(key))
            continue;
        const id = foldId(key);
        of.set(n.id, id);
        if (!members.has(id))
            members.set(id, []);
        members.get(id)!.push(n.id);
    }
    if (of.size === 0)
        return view;
    for (const group of view.index.groups) {
        const family = conditionFamily(group.id);
        if (family && folded.has(family) && members.has(foldId(family)))
            of.set(`group:${group.id}`, foldId(family));
    }
    const nodes: IndexNode[] = [];
    const placed = new Set<string>();
    for (const n of view.index.nodes) {
        if (!view.byId.has(n.id))
            continue;
        const id = of.get(n.id);
        if (id === undefined) {
            nodes.push(n);
            continue;
        }
        if (placed.has(id))
            continue;
        placed.add(id);
        const key = foldKey(n)!;
        const held = members.get(id)!;
        const group = view.index.groups.find((entry) => entry.id === key) ?? displayGroupOf(view.index, key);
        const { heading, noun } = bandHeading(view, key, n.layer);
        const fold: FoldInfo = {
            key,
            heading,
            members: held,
            summary: group && "children" in group && group.children
                ? `${group.children.filter(child => view.index.groups.find(g => g.id === child.id)?.members.some(id => held.includes(id))).length} groups · ${held.length} conditions`
                : `${held.length} ${noun}${held.length === 1 ? "" : "s"}`,
        };
        nodes.push({
            ...n,
            id,
            label: group?.label ?? view.index.taxonomies.phase?.values[key]?.label ?? key,
            lead: group?.lead ?? view.index.taxonomies.phase?.values[key]?.description ?? "",
            order: undefined,
            source: group && "source" in group ? group.source : n.source,
            fold,
        });
    }
    const remap = (id: string) => of.get(id) ?? id;
    const merged = new Map<string, {
        edge: Edge;
        sources: string[];
    }>();
    for (const e of view.index.edges) {
        if (!view.byId.has(e.from) || !view.byId.has(e.to))
            continue;
        const from = remap(e.from);
        const to = remap(e.to);
        if (from === to)
            continue;
        const id = edgeId(from, to);
        const groups = of.has(e.to) ? [] : e.groups;
        const cur = merged.get(id);
        if (!cur) {
            merged.set(id, { edge: { from, to, groups: [...groups] }, sources: [edgeId(e.from, e.to)] });
        }
        else {
            cur.sources.push(edgeId(e.from, e.to));
            for (const gi of groups)
                if (!cur.edge.groups.includes(gi))
                    cur.edge.groups.push(gi);
        }
    }
    const edges: Edge[] = [];
    const edgeSources = new Map<string, string[]>();
    const edgeDocs: GraphIndex["edgeDocs"] = {};
    for (const [id, { edge, sources }] of merged) {
        edges.push(edge);
        if (sources.length > 1 || sources[0] !== id)
            edgeSources.set(id, sources);
        const documented = sources.find((s) => s in view.index.edgeDocs);
        if (documented)
            edgeDocs[id] = view.index.edgeDocs[documented]!;
    }
    const gates: Record<string, Gate> = {};
    for (const [gatedId, gate] of Object.entries(view.index.gates)) {
        if (of.has(gatedId))
            continue;
        gates[gatedId] = gate.map((group) => ({
            ...group,
            all: group.all.map(remap).filter((m, i, all) => all.indexOf(m) === i),
        }));
    }
    const index: GraphIndex = { ...view.index, nodes, edges, gates, edgeDocs };
    const g = buildGraph(index, arrangement);
    g.fold = { of, members, edges: edgeSources };
    return g;
}
export function foldedId(map: FoldMap | undefined, id: string): string {
    if (!map)
        return id;
    const direct = map.of.get(id);
    if (direct)
        return direct;
    if (id.startsWith(GROUP_PREFIX)) {
        const asFold = foldId(id.slice(GROUP_PREFIX.length));
        return map.members.has(asFold) ? asFold : id;
    }
    const edge = parseEdgeId(id);
    if (edge)
        return edgeId(foldedId(map, edge.from), foldedId(map, edge.to));
    const gate = parseGateId(id);
    if (gate)
        return map.of.get(gate.gatedId) ?? id;
    return id;
}
export function foldedSet(map: FoldMap | undefined, ids: Iterable<string>): Set<string> {
    const out = new Set<string>();
    for (const id of ids)
        out.add(foldedId(map, id));
    return out;
}
export function foldedSelection(map: FoldMap | undefined, ids: readonly string[]): string[] {
    const out: string[] = [];
    for (const id of ids) {
        const mapped = foldedId(map, id);
        if (!out.includes(mapped))
            out.push(mapped);
        if (mapped !== id && id.startsWith(GROUP_PREFIX) && !out.includes(id))
            out.push(id);
    }
    return out;
}
