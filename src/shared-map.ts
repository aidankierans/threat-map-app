import { z } from "zod";
import { SCHEMAS, type LayerName } from "./build/schema.js";
import { assemble, type AssemblyConfig } from "./build/assemble.js";
import { deriveGraph } from "./build/derive.js";
import { validateCorpus } from "./build/validate-core.js";
import type { LoadedDoc } from "./build/load.js";
import type { FilterPreset, GraphIndex, ProseBundle, Reference } from "./types.js";
import { normalized, webMapBasis } from "./map-fingerprint.js";
export const MAX_MAP_REQUEST = 256 * 1024;
export const MAX_MAP_SNAPSHOT = 1500 * 1024;
const group = z.strictObject({ all: z.array(z.string().min(1).max(256)).min(1).max(128), partial: z.boolean().optional(), note: z.string().max(8000).optional() });
export const mapFieldsSchema = z.strictObject({
    label: z.string().trim().min(1).max(500).optional(), body: z.string().max(64000).optional(),
    status: z.enum(["draft", "reviewed", "verified"]).optional(), provenance: z.enum(["ai-drafted", "human-written", "human-verified"]).optional(),
    needs_citation: z.boolean().optional(), cites: z.array(z.string().min(1).max(200)).max(128).optional(),
    enabled_by: z.array(group).max(128).optional(),
});
export type MapFields = z.infer<typeof mapFieldsSchema>;
export const mapChangeSchema = z.strictObject({ id: z.string().min(1).max(256), fields: mapFieldsSchema });
export type MapChange = z.infer<typeof mapChangeSchema>;
export const mapWriteSchema = z.strictObject({
    action: z.enum(["preview", "publish"]), parent: z.string().min(1).max(100), baseRevision: z.string().min(1).max(100),
    changes: z.array(mapChangeSchema).max(32).default([]), summary: z.string().trim().min(1).max(500),
    restore: z.string().max(100).optional(), rebase: z.boolean().optional(), preview: z.string().max(100).optional(),
});
export type MapWrite = z.infer<typeof mapWriteSchema>;
export interface MapSeed {
    format: 1;
    revision: string;
    docs: LoadedDoc[];
    references: Record<string, Reference>;
    presets: FilterPreset[];
    config: AssemblyConfig;
}
export interface MapSnapshot {
    seed: MapSeed;
    overrides: MapChange[];
}
export interface MapRevision {
    sequence: number;
    id: string;
    parent: string;
    baseRevision: string;
    author: string;
    created: string;
    summary: string;
    changes: Array<{
        id: string;
        before: MapFields;
        after: MapFields;
    }>;
    restore?: string;
    rebased?: boolean;
}
export interface MapCatalog {
    head: string;
    deployedRevision: string;
    baseRevision: string;
    baseChanged: boolean;
    editable: boolean;
    index?: GraphIndex;
    prose?: ProseBundle;
    revision?: MapRevision;
}
export interface MapDocument {
    head: string;
    deployedRevision: string;
    baseRevision: string;
    baseChanged: boolean;
    id: string;
    layer: string;
    fields: MapFields;
    editableFields: string[];
    nodes: Array<{
        id: string;
        label: string;
        layer: string;
    }>;
}
export interface MapPreview {
    preview: string;
    changes: MapRevision["changes"];
    warnings: string[];
    index: GraphIndex;
    prose: ProseBundle;
    deploymentConflicts?: MapRevision["changes"];
}
export function mapFields(doc: LoadedDoc): MapFields {
    const fields: MapFields = { body: doc.body };
    for (const key of Object.keys(mapFieldsSchema.shape).filter(k => k !== "body")) {
        if (doc.meta[key] !== undefined)
            Object.assign(fields, { [key]: structuredClone(doc.meta[key]) });
    }
    return fields;
}
export function editableMapDocument(doc: LoadedDoc): boolean {
    return ["stage", "component", "affordance", "failure-mode", "condition", "event", "edge"].includes(doc.meta.layer);
}
export function applyMapChanges(snapshot: MapSnapshot, changes: MapChange[]): {
    snapshot: MapSnapshot;
    changes: MapRevision["changes"];
} {
    const next = structuredClone(snapshot);
    const changed: MapRevision["changes"] = [];
    const seen = new Set<string>();
    for (const change of changes) {
        if (seen.has(change.id))
            throw new Error(`Duplicate change for ${change.id}.`);
        seen.add(change.id);
        const doc = next.seed.docs.find(d => d.meta.id === change.id);
        if (!doc || !editableMapDocument(doc))
            throw new Error(`This document cannot be edited here: ${change.id}.`);
        const before = mapFields(doc);
        const fields = mapFieldsSchema.parse(change.fields);
        const { body, ...meta } = fields;
        const schema = SCHEMAS[doc.meta.layer as LayerName];
        for (const key of Object.keys(meta))
            if (!(key in schema.shape))
                throw new Error(`${key} does not apply to ${doc.meta.layer}.`);
        const parsed = schema.parse({ ...doc.meta, ...meta });
        doc.meta = { ...parsed, id: change.id };
        if (body !== undefined)
            doc.body = body;
        const prior = next.overrides.find(c => c.id === change.id);
        if (prior)
            prior.fields = { ...prior.fields, ...fields };
        else
            next.overrides.push({ id: change.id, fields });
        const after = mapFields(doc);
        if (normalized(before) !== normalized(after))
            changed.push({ id: change.id, before, after });
    }
    return { snapshot: next, changes: changed };
}
export function rebaseMap(snapshot: MapSnapshot, deployed: MapSeed): MapSnapshot {
    return applyMapChanges({ seed: structuredClone(deployed), overrides: [] }, snapshot.overrides).snapshot;
}
export async function compileMap(snapshot: MapSnapshot) {
    const { seed } = snapshot;
    const graph = deriveGraph(seed.docs);
    const report = validateCorpus(seed.docs, graph, seed.references, seed.config, { whole: true });
    const result = assemble(seed.docs, graph, seed.references, seed.presets, { ...seed.config, safeDocuments: snapshot.overrides.map(c => c.id) });
    const errors = [...report.errors, ...result.errors];
    if (errors.length)
        throw new MapValidationError(errors);
    result.index.mapBasis = await webMapBasis(result.index, result.prose);
    return { index: result.index, prose: result.prose, warnings: report.warnings };
}
export class MapValidationError extends Error {
    constructor(readonly errors: string[]) { super(errors.join("\n")); }
}
