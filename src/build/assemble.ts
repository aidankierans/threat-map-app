import type { LayersConfig } from "./config.js";
import type { LayerConfig, Taxonomies } from "../types.js";
import type { LoadedDoc } from "./load.js";
import type { DerivedGraph } from "./derive.js";
import { leadSentence, renderMarkdown } from "./markdown.js";
import type { ComponentIndex, EdgeDocIndex, FilterPreset, GraphIndex, IndexNode, PageIndex, ProseBundle, ProseDoc, QuestionIndex, Reference, GroupIndex, Status, } from "../types.js";
export interface AssemblyConfig {
    graphLayers: LayerConfig[];
    layersConfig: LayersConfig;
    taxonomies: Taxonomies;
    safeMarkdown?: boolean;
    safeDocuments?: string[];
}
export function assemble(docs: LoadedDoc[], graph: DerivedGraph, references: Record<string, Reference>, presets: FilterPreset[], config: AssemblyConfig): {
    index: GraphIndex;
    prose: ProseBundle;
    errors: string[];
} {
    const { graphLayers, layersConfig, taxonomies } = config;
    const errors: string[] = [];
    const byId = new Map<string, LoadedDoc>(docs.map((d) => [d.meta.id, d]));
    const describe = (d: LoadedDoc) => ({
        id: d.meta.id,
        label: d.meta.label ?? d.meta.id,
        layer: d.meta.layer,
    });
    const resolveId = (id: string) => {
        const doc = byId.get(id);
        return doc ? describe(doc) : undefined;
    };
    const proseDocs: Record<string, ProseDoc> = {};
    for (const doc of docs) {
        const rendered = renderMarkdown(doc.body, {
            resolveId,
            references,
            source: doc.source,
            safe: config.safeMarkdown || config.safeDocuments?.includes(doc.meta.id),
        });
        errors.push(...rendered.errors);
        const cites = [...new Set([...(doc.meta.cites ?? []), ...rendered.cites])];
        proseDocs[doc.meta.id] = { html: rendered.html, cites, ...(doc.meta.layer === "question" ? { markdown: doc.body } : {}) };
    }
    const usedKeys = new Set(Object.values(proseDocs).flatMap((d) => d.cites));
    const shippedRefs: Record<string, Reference> = {};
    for (const key of usedKeys) {
        if (references[key])
            shippedRefs[key] = references[key];
    }
    const graphLayerNames = new Set(graphLayers.map((l) => l.name));
    const declares = (layer: string, relation: string) => ((layersConfig.layers[layer] ?? layersConfig.auxiliary?.[layer])?.declares ?? []).includes(relation);
    const groupOf = new Map<string, {
        group: string;
        rung: number;
    }>();
    const bandDocs: LoadedDoc[] = [];
    const subtrees = new Map<string, string[]>();
    for (const d of docs) {
        if (!declares(d.meta.layer, "members"))
            continue;
        bandDocs.push(d);
        (d.meta.members ?? []).forEach((id: string, i: number) => {
            if (!groupOf.has(id))
                groupOf.set(id, { group: d.meta.id, rung: i });
        });
    }
    const treeDocs = docs.filter((d) => declares(d.meta.layer, "parent"));
    const parentOf = new Map<string, string | undefined>(treeDocs.map((d) => [d.meta.id, d.meta.parent]));
    const rootOf = (id: string): string | undefined => {
        const seen = new Set<string>([id]);
        let cur = id;
        for (;;) {
            const parent = parentOf.get(cur);
            if (parent === undefined)
                return cur;
            if (seen.has(parent) || !parentOf.has(parent))
                return undefined;
            seen.add(parent);
            cur = parent;
        }
    };
    const within = (d: LoadedDoc) => d.meta.order ?? Number.MAX_SAFE_INTEGER;
    for (const d of [...treeDocs].sort((a, b) => within(a) - within(b))) {
        if (d.meta.parent === undefined) {
            bandDocs.push(d);
            continue;
        }
        const root = rootOf(d.meta.id);
        if (!root)
            continue;
        const members = subtrees.get(root) ?? [];
        subtrees.set(root, members);
        groupOf.set(d.meta.id, { group: root, rung: members.length });
        members.push(d.meta.id);
    }
    const bandIds = new Set(bandDocs.map((d) => d.meta.id));
    const layerRank = new Map(graphLayers.map((l, i) => [l.name as string, i]));
    const nodes: IndexNode[] = docs
        .filter((d) => graphLayerNames.has(d.meta.layer) && !bandIds.has(d.meta.id))
        .map((d) => {
        const m = d.meta;
        return {
            id: m.id,
            layer: m.layer,
            tag: m.tag ?? m.id.split("-").slice(1).join("-"),
            label: m.label,
            lead: leadSentence(d.body),
            bucket: m.evidence_bucket,
            bucketNote: m.bucket_note,
            phase: m.phase,
            group: groupOf.get(m.id)?.group,
            order: m.order ?? groupOf.get(m.id)?.rung,
            context: m.context,
            status: m.status,
            provenance: m.provenance,
            needsCitation: m.needs_citation,
            source: d.source,
        };
    })
        .sort((a, b) => (layerRank.get(a.layer) ?? 0) - (layerRank.get(b.layer) ?? 0) ||
        a.id.localeCompare(b.id));
    const groups: GroupIndex[] = bandDocs
        .map((d) => ({
        id: d.meta.id,
        layer: d.meta.layer,
        label: d.meta.label,
        kind: d.meta.kind ?? "classifying",
        subject: d.meta.subject,
        short: d.meta.short,
        lead: leadSentence(d.body),
        members: d.meta.members ?? subtrees.get(d.meta.id) ?? [],
        order: d.meta.order ?? 0,
        source: d.source,
    }))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const questions: QuestionIndex[] = docs
        .filter((d) => d.meta.layer === "question")
        .map((d) => ({
        id: d.meta.id,
        label: d.meta.label,
        order: d.meta.order ?? 0,
        bucket: d.meta.evidence_bucket,
        bucketNote: d.meta.bucket_note,
        addresses: d.meta.addresses ?? [],
        status: d.meta.status,
        provenance: d.meta.provenance,
        source: d.source,
    }))
        .sort((a, b) => a.order - b.order);
    const carries = new Map<string, string[]>();
    for (const [gatedId, gate] of Object.entries(graph.gates)) {
        for (const member of new Set(gate.flatMap((g) => g.all))) {
            if (byId.get(member)?.meta.layer !== "component")
                continue;
            const list = carries.get(member) ?? [];
            carries.set(member, list);
            list.push(gatedId);
        }
    }
    const components: ComponentIndex[] = docs
        .filter((d) => d.meta.layer === "component")
        .map((d) => ({
        id: d.meta.id,
        label: d.meta.label,
        parent: d.meta.parent,
        mapsTo: (carries.get(d.meta.id) ?? []).sort(),
        order: d.meta.order ?? 0,
        source: d.source,
    }))
        .sort((a, b) => a.order - b.order);
    const pages: PageIndex[] = docs
        .filter((d) => d.meta.layer === "page")
        .map((d) => ({
        id: d.meta.id,
        slug: d.meta.slug,
        label: d.meta.label,
        navLabel: d.meta.nav_label ?? d.meta.label,
        order: d.meta.order ?? 0,
        source: d.source,
        ...(d.meta.widget ? { widget: d.meta.widget } : {}),
    }))
        .sort((a, b) => a.order - b.order);
    const edgeDocs: Record<string, EdgeDocIndex> = {};
    for (const d of docs) {
        if (d.meta.layer !== "edge")
            continue;
        edgeDocs[d.meta.id] = {
            from: d.meta.from,
            to: d.meta.to,
            label: d.meta.label,
            lead: leadSentence(d.body),
            status: d.meta.status,
            provenance: d.meta.provenance,
            needsCitation: d.meta.needs_citation,
            source: d.source,
        };
    }
    const byStatus = { draft: 0, reviewed: 0, verified: 0 } as Record<Status, number>;
    for (const d of docs)
        byStatus[d.meta.status as Status]++;
    const index: GraphIndex = {
        generatedAt: "content-hash",
        layers: graphLayers,
        taxonomies,
        nodes,
        edges: graph.edges,
        edgeDocs,
        gates: graph.gates,
        gateMembers: layersConfig.gates as GraphIndex["gateMembers"],
        questions,
        groups,
        components,
        pages,
        presets,
        stats: {
            nodes: nodes.length,
            edges: graph.edges.length,
            references: Object.keys(shippedRefs).length,
            byStatus,
        },
    };
    const prose: ProseBundle = { docs: proseDocs, references: shippedRefs };
    index.sourceKeys = Object.fromEntries(Object.entries(prose.docs).map(([id, doc]) => [id, doc.cites]));
    return { index, prose, errors };
}
