import type { Edge, Gate, Group } from "../types.js";
import type { LoadedDoc } from "./load.js";
import { edgeId } from "../edge-id.js";
export interface DerivedGraph {
    edges: Edge[];
    gates: Record<string, Gate>;
    outgoing: Record<string, string[]>;
    incoming: Record<string, string[]>;
}
export function deriveGraph(docs: LoadedDoc[]): DerivedGraph {
    const gates: Record<string, Gate> = {};
    const byPair = new Map<string, Edge>();
    const edges: Edge[] = [];
    for (const doc of docs) {
        const m = doc.meta;
        const gate: Group[] | undefined = m.enabled_by;
        if (!gate)
            continue;
        gates[m.id] = gate.map((g) => ({
            all: g.all,
            ...(g.note ? { note: g.note } : {}),
            ...(g.partial ? { partial: true } : {}),
        }));
        gate.forEach((group, gi) => {
            for (const member of group.all) {
                const key = edgeId(member, m.id);
                const existing = byPair.get(key);
                if (existing) {
                    if (!existing.groups.includes(gi))
                        existing.groups.push(gi);
                    continue;
                }
                const edge: Edge = { from: member, to: m.id, groups: [gi] };
                byPair.set(key, edge);
                edges.push(edge);
            }
        });
    }
    const outgoing: Record<string, string[]> = {};
    const incoming: Record<string, string[]> = {};
    for (const e of edges) {
        (outgoing[e.from] ??= []).push(e.to);
        (incoming[e.to] ??= []).push(e.from);
    }
    return { edges, gates, outgoing, incoming };
}
