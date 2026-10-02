import { z } from 'zod';
import type { GraphIndex, ProseBundle } from '../types.js';
import type { AnalysisDocument } from './reader-state.js';
import { sharedMarkdown } from './shared-markdown.js';
const text = z.string().max(64000);
const id = z.string().min(1).max(256).refine(s => !['__proto__', 'constructor', 'prototype'].includes(s));
const list = <T extends z.ZodType>(item: T) => z.array(item).max(4096);
const record = <T extends z.ZodType>(item: T) => z.record(id, item);
const obj = z.strictObject;
const layer = z.enum(['component', 'stage', 'affordance', 'failure-mode', 'condition', 'event']);
const status = z.enum(['draft', 'reviewed', 'verified']);
const phase = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'X']);
const entry = obj({ label: text, description: text.optional(), short: text.optional(), tip: text.optional(), marker: z.boolean().optional() });
const vocabulary = obj({ values: record(entry) });
const source = obj({ key: id, title: text, url: text.refine(s => !s || /^https?:\/\//i.test(s)), authors: text.optional(), year: text.optional(), venue: text.optional(), urldate: text.optional() });
export const portableMapSchema = obj({
    version: z.literal(1),
    layers: list(obj({ name: layer, label: text, role: z.enum(['spine', 'aside']), hue: z.string().regex(/^--[a-zA-Z0-9-]+$/) })),
    nodes: list(obj({ id, layer, tag: text, label: text, lead: text, bucket: z.enum(['eval', 'private', 'assessment', 'hard']).optional(), phase: phase.optional(), group: id.optional(), order: z.number().finite().optional(), context: z.enum(['internal', 'external', 'boundary']).optional(), status, provenance: z.enum(['ai-drafted', 'human-written', 'human-verified']), needsCitation: z.boolean(), source: z.literal('') })),
    groups: list(obj({ id, layer: z.enum(['condition-group', 'act-class', 'consequence', 'component']), label: text, kind: z.enum(['partition', 'scale', 'classifying']), subject: text.optional(), short: text.optional(), lead: text, members: list(id), order: z.number().finite(), source: z.literal('') })),
    components: list(obj({ id, label: text, parent: id.optional(), mapsTo: list(id), order: z.number().finite(), source: z.literal('') })),
    gates: record(list(obj({ all: list(id).min(1), note: text.optional(), partial: z.boolean().optional() }))),
    taxonomies: obj({ evidence_bucket: vocabulary, phase: obj({ order: list(phase), values: record(entry) }), context: vocabulary, status: obj({ order: list(status), values: record(entry) }), provenance: vocabulary }),
    descriptions: record(obj({ text, cites: list(id) })), references: record(source),
});
export type PortableMap = z.infer<typeof portableMapSchema>;
// Imported data never supplies HTML, scripts, widgets, source URLs or host configuration.
export function portableIndex(bundle: PortableMap, basis: AnalysisDocument['map']): GraphIndex {
    const ids = new Set(bundle.nodes.map(n => n.id));
    const unique = (values: string[], what: string) => { if (new Set(values).size !== values.length)
        throw Error(`Portable map has duplicate ${what}.`); };
    unique(bundle.nodes.map(n => n.id), 'nodes');
    unique(bundle.groups.map(n => n.id), 'groups');
    unique(bundle.components.map(n => n.id), 'components');
    unique(bundle.layers.map(n => n.name), 'layers');
    const components = new Map(bundle.components.map(n => [n.id, n]));
    for (const c of bundle.components) {
        const seen = new Set<string>();
        let p: typeof c | undefined = c;
        while (p) {
            if (seen.has(p.id))
                throw Error('Portable component hierarchy contains a cycle.');
            seen.add(p.id);
            if (p.parent && !components.has(p.parent))
                throw Error(`Missing portable parent: ${p.parent}`);
            p = p.parent ? components.get(p.parent) : undefined;
        }
    }
    for (const g of bundle.groups)
        for (const m of g.members)
            if (!ids.has(m))
                throw Error(`Missing portable group member: ${m}`);
    for (const n of bundle.nodes) {
        if (!bundle.layers.some(l => l.name === n.layer))
            throw Error(`Missing portable layer: ${n.layer}`);
        if (n.group && !bundle.groups.some(g => g.id === n.group) && !components.has(n.group))
            throw Error(`Missing portable group: ${n.group}`);
    }
    const edges: GraphIndex['edges'] = [];
    for (const [to, groups] of Object.entries(bundle.gates)) {
        if (!ids.has(to))
            throw Error(`Missing portable target: ${to}`);
        groups.forEach((g, i) => g.all.forEach(from => { if (!ids.has(from))
            throw Error(`Missing portable prerequisite: ${from}`); const edge = edges.find(e => e.from === from && e.to === to); if (edge)
            edge.groups.push(i);
        else
            edges.push({ from, to, groups: [i] }); }));
    }
    for (const d of Object.values(bundle.descriptions))
        for (const cite of d.cites)
            if (!bundle.references[cite])
                throw Error(`Missing portable citation: ${cite}`);
    return { generatedAt: 'portable-case', layers: bundle.layers, taxonomies: bundle.taxonomies, nodes: bundle.nodes, groups: bundle.groups, components: bundle.components, gates: bundle.gates, edges, edgeDocs: {}, gateMembers: {}, questions: [], pages: [], presets: [], mapBasis: basis, sourceKeys: {}, stats: { nodes: ids.size, edges: edges.length, references: Object.keys(bundle.references).length, byStatus: { draft: bundle.nodes.filter(n => n.status === 'draft').length, reviewed: bundle.nodes.filter(n => n.status === 'reviewed').length, verified: bundle.nodes.filter(n => n.status === 'verified').length } } };
}
export function portableProse(bundle: PortableMap, index: GraphIndex): ProseBundle {
    return { references: bundle.references, docs: Object.fromEntries(Object.entries(bundle.descriptions).map(([id, d]) => [id, { html: sharedMarkdown(d.text, index, bundle.references), cites: d.cites }])) };
}
export function bundleCase(doc: AnalysisDocument, index: GraphIndex, prose: ProseBundle): AnalysisDocument {
    if (doc.embeddedMap)
        return structuredClone(doc);
    const stories = [...doc.content.stories, ...doc.content.archivedStories.map(a => a.story)];
    const ids = new Set(stories.flatMap(s => s.occurrences.flatMap(o => [o.node, ...(o.argument.kind === 'requirement' ? o.argument.ref.all : [])])));
    for (const id of [...doc.content.request.waypoints, ...doc.content.request.destinations])
        ids.add(id);
    const missing = [...ids].filter(id => !index.nodes.some(n => n.id === id));
    if (missing.length)
        throw Error(`Cannot export missing nodes: ${missing.join(', ')}`);
    const gates: PortableMap['gates'] = {};
    for (const s of stories)
        for (const o of s.occurrences)
            if (o.argument.kind === 'requirement') {
                const r = o.argument.ref;
                const g = { all: [...r.all], ...(r.note ? { note: r.note } : {}), ...(r.partial ? { partial: true } : {}) };
                const groups = gates[r.target] ??= [];
                if (!groups.some(v => JSON.stringify(v) === JSON.stringify(g)))
                    groups.push(g);
            }
    const componentIds = new Set(index.components.filter(c => ids.has(c.id)).map(c => c.id));
    for (const id of componentIds) {
        const parent = index.components.find(c => c.id === id)?.parent;
        if (parent)
            componentIds.add(parent);
    }
    const groups = index.groups.filter(g => g.members.some(id => ids.has(id))).map(g => ({ ...g, members: g.members.filter(id => ids.has(id)), source: '' as const }));
    const components = index.components.filter(c => componentIds.has(c.id)).map(c => ({ ...c, mapsTo: c.mapsTo.filter(id => ids.has(id)), source: '' as const }));
    const docIds = new Set([...ids, ...groups.map(g => g.id), ...componentIds]);
    const descriptions: PortableMap['descriptions'] = {};
    const cites = new Set<string>();
    for (const id of docIds) {
        const d = prose.docs[id];
        if (!d) {
            if (ids.has(id))
                throw Error(`Node description is not loaded: ${id}`);
            continue;
        }
        const parsed = new DOMParser().parseFromString(d.html, 'text/html');
        parsed.querySelectorAll('script,style,iframe').forEach(el => el.remove());
        parsed.querySelectorAll('p,li,h1,h2,h3,h4,br').forEach(el => el.append('\n'));
        // Plain description text is safe to transport and cannot carry hidden link targets.
        const plain = parsed.body.textContent ?? '';
        descriptions[id] = { text: plain.replace(/([\\`*_{}\[\]<>])/g, '\\$1'), cites: [...d.cites] };
        d.cites.forEach(c => cites.add(c));
    }
    for (const m of JSON.stringify(doc.content).matchAll(/\[@([^\]]+)\]/g))
        m[1].split(';').forEach(k => cites.add(k.trim().replace(/^@/, '')));
    const bases = [...doc.content.judgments, ...doc.content.context.mappings, ...doc.content.archivedStories.flatMap(a => [...a.judgments, ...a.context.mappings])];
    bases.forEach(b => b.sources.forEach(s => { if (s.reference.kind === 'citation')
        cites.add(s.reference.key); }));
    const references: PortableMap['references'] = {};
    for (const key of cites) {
        if (!prose.references[key])
            throw Error(`Citation is not loaded: ${key}`);
        references[key] = prose.references[key];
    }
    const nodes = index.nodes.filter(n => ids.has(n.id)).map(({ fold, bucketNote, ...n }) => ({ ...n, source: '' as const }));
    const pick = (values: Record<string, unknown>, keys: Set<string>) => Object.fromEntries(Object.entries(values).filter(([k]) => keys.has(k)));
    const taxonomies = { evidence_bucket: { values: pick(index.taxonomies.evidence_bucket.values, new Set(nodes.flatMap(n => n.bucket ? [n.bucket] : []))) }, phase: { order: index.taxonomies.phase.order.filter(p => nodes.some(n => n.phase === p)), values: pick(index.taxonomies.phase.values, new Set(nodes.flatMap(n => n.phase ? [n.phase] : []))) }, context: { values: pick(index.taxonomies.context.values, new Set(nodes.flatMap(n => n.context ? [n.context] : []))) }, status: { order: index.taxonomies.status.order, values: index.taxonomies.status.values }, provenance: { values: index.taxonomies.provenance.values } };
    const embeddedMap = portableMapSchema.parse({ version: 1, layers: index.layers, nodes, groups, components, gates, taxonomies, descriptions, references });
    const result = structuredClone(doc);
    result.embeddedMap = embeddedMap;
    result.parent = doc.identity;
    result.identity = { ...doc.identity, revisionId: crypto.randomUUID() };
    // Solver fingerprints may describe private, unchosen branches; retain only exported resources.
    const allowed = new Set([...ids].map(id => `node:${id}`).concat([...cites].map(key => `source:${key}`)));
    result.map.dependencies = result.map.dependencies.filter(d => allowed.has(d.key));
    for (const a of result.content.archivedStories)
        a.map.dependencies = a.map.dependencies.filter(d => allowed.has(d.key));
    result.content.view.selection = result.content.view.selection.filter(id => ids.has(id));
    result.content.view.filters.hidden = [];
    result.content.view.filters.fold = { all: false, except: [] };
    result.content.view.filters.query = '';
    portableIndex(embeddedMap, result.map);
    return result;
}
