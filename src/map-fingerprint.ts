import type { GraphIndex, ProseBundle } from "./types.js";
import type { MapBasis } from "./app/reader-state.js";
import { requirementKey } from "./app/case-codec.js";
export function normalized(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(normalized).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${normalized(v)}`).join(",")}}`;
    return JSON.stringify(value);
}
export function basisContent(index: GraphIndex, prose: ProseBundle) {
    const { generatedAt: _stamp, mapBasis: _basis, caseStudies: _cases, presets: _presets, ...graph } = index;
    const dependencies: Array<{
        key: string;
        label: string;
        value: unknown;
    }> = [];
    const add = (key: string, label: string, value: unknown) => dependencies.push({ key, label, value });
    for (const n of index.nodes)
        add(`node:${n.id}`, n.label, [n, prose.docs[n.id]]);
    for (const [target, groups] of Object.entries(index.gates))
        for (const g of groups) {
            const r = { target, all: [...g.all].sort(), partial: !!g.partial, note: g.note ?? "" };
            add(`requirement:${requirementKey(r)}`, target, r);
        }
    for (const [id, edge] of Object.entries(index.edgeDocs))
        add(`edge:${id}`, edge.label ?? id, [edge, prose.docs[id]]);
    for (const [key, source] of Object.entries(prose.references))
        add(`source:${key}`, key, source);
    add("rules", "Reasoning rules and subject taxonomy", [index.groups, index.gateMembers, index.taxonomies, index.layers, 1]);
    return { revision: [graph, prose], dependencies };
}
export async function webDigest(value: unknown): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized(value)));
    return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function webMapBasis(index: GraphIndex, prose: ProseBundle): Promise<MapBasis> {
    const content = basisContent(index, prose);
    return { revision: await webDigest(content.revision), rulesVersion: 1,
        dependencies: await Promise.all(content.dependencies.map(async ({ key, label, value }) => ({ key, label, digest: await webDigest(value) }))) };
}
