import { z } from "zod";
import { SCHEMAS, type LayerName } from "./build/schema.js";
import type { LoadedDoc } from "./build/load.js";
import { compileMap, type MapSeed } from "./shared-map.js";
import { edgeId } from "./edge-id.js";
import { normalized } from "./map-fingerprint.js";
import type { Reference } from "./types.js";
export const MANIFEST_KIND = "threat-map/manifest";
export const MAX_MANIFEST_BYTES = 1536 * 1024;
const MAX_DOC_BYTES = 96 * 1024;
// Pages and questions can name widgets or host behaviour; a manifest only carries map content.
export const MANIFEST_LAYERS = ["component", "stage", "affordance", "failure-mode", "condition", "event", "condition-group", "act-class", "consequence", "edge"] as const satisfies readonly LayerName[];
export type ManifestLayer = typeof MANIFEST_LAYERS[number];
export const isManifestLayer = (layer: unknown): layer is ManifestLayer => (MANIFEST_LAYERS as readonly unknown[]).includes(layer);
export function isHttpUrl(value: string): boolean {
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    }
    catch {
        return false;
    }
}
const short = z.string().max(2000);
export const REFERENCE_KEY = /^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,199}$/;
const referenceSchema = z.strictObject({
    key: z.string().regex(REFERENCE_KEY), title: short, url: z.string().max(2048).refine(s => s === "" || isHttpUrl(s), "Source links must use http or https."),
    authors: short.optional(), year: short.optional(), venue: short.optional(), urldate: short.optional(),
});
const documentSchema = z.strictObject({ meta: z.record(z.string(), z.unknown()), body: z.string().max(64000) });
const manifestSchema = z.strictObject({
    kind: z.literal(MANIFEST_KIND), version: z.literal(1), base: z.string().min(1).max(100),
    docs: z.array(documentSchema).max(4096), references: z.record(z.string().regex(REFERENCE_KEY), referenceSchema),
});
export interface ManifestDoc {
    meta: Record<string, any>;
    body: string;
}
export interface Manifest {
    kind: typeof MANIFEST_KIND;
    version: 1;
    base: string;
    docs: ManifestDoc[];
    references: Record<string, Reference>;
}
/** Validates a document's fields against its layer, rejecting fields the layer does not define. */
export function parseManifestMeta(meta: Record<string, unknown>): Record<string, any> {
    const layer = meta.layer;
    if (!isManifestLayer(layer))
        throw Error(`Unsupported node type: ${String(layer)}.`);
    const { id, ...fields } = meta;
    const parsed = (SCHEMAS[layer] as z.ZodObject).strict().parse(layer === "edge" ? fields : meta) as Record<string, any>;
    if (layer === "edge") {
        parsed.id = edgeId(parsed.from, parsed.to);
        if (id !== undefined && id !== parsed.id)
            throw Error(`Edge ID must be ${parsed.id}.`);
    }
    return parsed;
}
/** Parses a manifest from storage or a file. Everything in it is treated as untrusted. */
export function parseManifest(input: string | unknown): Manifest {
    const raw = typeof input === "string" ? input : JSON.stringify(input);
    if (new TextEncoder().encode(raw).length > MAX_MANIFEST_BYTES)
        throw Error("Map file exceeds the 1.5 MiB limit.");
    const data = manifestSchema.parse(JSON.parse(raw, (key, value) => {
        if (key === "__proto__" || key === "constructor" || key === "prototype")
            throw Error(`Map files cannot contain a field named ${key}.`);
        return value;
    }));
    const ids = new Set<string>();
    const docs = data.docs.map(doc => {
        if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_DOC_BYTES)
            throw Error("A node in this map file is too large.");
        const meta = parseManifestMeta(doc.meta);
        if (ids.has(meta.id))
            throw Error(`Duplicate node ID: ${meta.id}.`);
        ids.add(meta.id);
        return { meta, body: doc.body };
    });
    for (const [key, reference] of Object.entries(data.references))
        if (reference.key !== key)
            throw Error(`Source ${key} has a mismatched key.`);
    return { kind: MANIFEST_KIND, version: 1, base: data.base, docs, references: data.references };
}
export function manifestFromSeed(seed: MapSeed): Manifest {
    return parseManifest({ kind: MANIFEST_KIND, version: 1, base: seed.revision, docs: seed.docs.filter(d => isManifestLayer(d.meta.layer)).map(d => ({ meta: d.meta, body: d.body })), references: seed.references });
}
const sameDoc = (a: ManifestDoc | LoadedDoc | undefined, b: ManifestDoc | LoadedDoc | undefined) => !!a && !!b && normalized({ meta: a.meta, body: a.body }) === normalized({ meta: b.meta, body: b.body });
/** IDs of documents that differ from the bundled map, including new ones. */
export function changedDocuments(seed: MapSeed, manifest: Manifest): string[] {
    const original = new Map(seed.docs.map(d => [d.meta.id, d]));
    return manifest.docs.filter(d => !sameDoc(d, original.get(d.meta.id))).map(d => d.meta.id);
}
export function manifestDiffers(seed: MapSeed, manifest: Manifest): boolean {
    const kept = seed.docs.filter(d => isManifestLayer(d.meta.layer));
    return changedDocuments(seed, manifest).length > 0 || kept.length !== manifest.docs.length || normalized(manifest.references) !== normalized(seed.references);
}
/** The bundled map with its node documents replaced by the manifest's. Pages, questions and layer configuration always come from the deployment. */
export function mergeManifest(seed: MapSeed, manifest: Manifest): MapSeed {
    const local = new Map(manifest.docs.map(d => [d.meta.id, d]));
    const bundled = new Set(seed.docs.map(d => d.meta.id));
    // Bundled documents keep their order and source, so an unedited copy reproduces the bundled map exactly.
    const kept = seed.docs.flatMap(d => !isManifestLayer(d.meta.layer) ? [d] : local.has(d.meta.id) ? [{ ...local.get(d.meta.id)!, source: d.source }] : []);
    const added = manifest.docs.filter(d => !bundled.has(d.meta.id)).map(d => ({ meta: d.meta, body: d.body, source: `local/${d.meta.id}` }));
    const docs = [...kept, ...added];
    return { ...seed, docs, references: { ...seed.references, ...manifest.references } };
}
/** Changed documents render in safe mode: raw HTML is escaped and only http(s) or in-map links are kept. */
export function compileManifest(seed: MapSeed, manifest: Manifest) {
    return compileMap({ seed: mergeManifest(seed, manifest), overrides: changedDocuments(seed, manifest).map(id => ({ id, fields: {} })) });
}
export function exportManifest(manifest: Manifest): string {
    return JSON.stringify(manifest, null, 2);
}
