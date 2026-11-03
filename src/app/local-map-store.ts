import { z } from "zod";
import { MapValidationError, type MapSeed } from "../shared-map.js";
import { compileManifest, exportManifest, isManifestLayer, manifestDiffers, manifestFromSeed, mergeManifest, parseManifest, parseManifestMeta, type Manifest, type ManifestDoc } from "../local-map.js";
import { normalized, webDigest } from "../map-fingerprint.js";
import { formSchemaFor } from "../dev/editor/form-schema.js";
import type { EditorRequest } from "../dev/editor/api.js";
import type { GraphIndex, ProseBundle } from "../types.js";
import { LOCAL_MAP_DRAFTS_KEY, LOCAL_MAP_KEY } from "./local-map-key.js";
export interface LocalMapState {
    index: GraphIndex;
    prose: ProseBundle;
    /** The manifest differs from the bundled map. */
    changed: boolean;
    /** The manifest was made from an earlier version of the bundled map. */
    outdated: boolean;
    /** Edits are only in memory because browser storage refused them. */
    unsaved: boolean;
    /** A stored map could not be read and the bundled map is shown instead. */
    recovered: string;
}
interface Draft {
    body: string;
    reason: "schema" | "conflict";
    errors: string[];
    savedAt: string;
}
const GROUP_MEMBERS: Record<string, string> = { "condition-group": "condition", "act-class": "failure-mode", consequence: "event" };
const creation = z.strictObject({ meta: z.record(z.string(), z.unknown()), body: z.string().max(64000), group: z.string().max(256).optional() });
const saveRequest = z.strictObject({ id: z.string().max(256), baseHash: z.string().max(128), body: z.string().max(64000).optional(), set: z.record(z.string(), z.unknown()).optional(), unset: z.array(z.string().max(100)).max(100).optional() });
const draftRequest = z.strictObject({ id: z.string().max(256), body: z.string().max(64000).optional(), slot: z.literal("discarded").optional() });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const docHash = (doc: ManifestDoc) => webDigest({ meta: doc.meta, body: doc.body });
const message = (error: unknown) => error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(".") || "fields"}: ${i.message}`) : error instanceof MapValidationError ? error.errors : [error instanceof Error ? error.message : String(error)];
function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function write(key: string, value: string | null): boolean {
    try {
        if (value === null)
            localStorage.removeItem(key);
        else
            localStorage.setItem(key, value);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * A copy of the map kept in this browser. Every write is validated as untrusted input,
 * compiled with changed documents in safe mode, and only then stored.
 */
export class LocalMapStore {
    private listeners = new Set<(state: LocalMapState) => void>();
    private drafts: Record<string, Draft>;
    private constructor(readonly seed: MapSeed, private manifest: Manifest, public state: LocalMapState) {
        this.drafts = LocalMapStore.readDrafts();
    }
    static async open(seed: MapSeed): Promise<LocalMapStore> {
        const stored = read(LOCAL_MAP_KEY);
        if (stored) {
            try {
                const manifest = parseManifest(stored);
                return new LocalMapStore(seed, manifest, await LocalMapStore.compile(seed, manifest, true, ""));
            }
            catch (error) {
                const original = manifestFromSeed(seed);
                // Keep the unreadable copy in storage so a later version can still recover it.
                return new LocalMapStore(seed, original, await LocalMapStore.compile(seed, original, true, `Your saved map could not be loaded, so the original map is shown. ${message(error).slice(0, 3).join(" ")}`));
            }
        }
        const original = manifestFromSeed(seed);
        return new LocalMapStore(seed, original, await LocalMapStore.compile(seed, original, true, ""));
    }
    private static async compile(seed: MapSeed, manifest: Manifest, saved: boolean, recovered: string): Promise<LocalMapState> {
        const { index, prose } = await compileManifest(seed, manifest);
        return { index, prose, changed: manifestDiffers(seed, manifest), outdated: manifest.base !== seed.revision, unsaved: !saved, recovered };
    }
    private static readDrafts(): Record<string, Draft> {
        try {
            const value = JSON.parse(read(LOCAL_MAP_DRAFTS_KEY) ?? "{}");
            const draft = z.strictObject({ body: z.string().max(64000), reason: z.enum(["schema", "conflict"]), errors: z.array(z.string().max(8000)).max(50), savedAt: z.string().max(40) });
            return Object.fromEntries(Object.entries(z.record(z.string().max(256), z.unknown()).parse(value)).flatMap(([id, v]) => { const parsed = draft.safeParse(v); return parsed.success && id !== "__proto__" ? [[id, parsed.data]] : []; }));
        }
        catch {
            return {};
        }
    }
    subscribe(listener: (state: LocalMapState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Validates and compiles a whole manifest, then stores it. Throws without changing anything if it is invalid. */
    async replace(input: unknown): Promise<LocalMapState> {
        const manifest = parseManifest(input);
        const differs = manifestDiffers(this.seed, manifest);
        const next = await LocalMapStore.compile(this.seed, manifest, true, "");
        const saved = write(LOCAL_MAP_KEY, differs ? exportManifest(manifest) : null);
        this.manifest = manifest;
        this.state = { ...next, unsaved: !saved };
        for (const listener of this.listeners)
            listener(this.state);
        return this.state;
    }
    async reset(): Promise<LocalMapState> {
        this.drafts = {};
        write(LOCAL_MAP_DRAFTS_KEY, null);
        return this.replace(manifestFromSeed(this.seed));
    }
    export(): string {
        return exportManifest(this.manifest);
    }
    private docs() {
        return mergeManifest(this.seed, this.manifest).docs;
    }
    private find(id: string) {
        return this.manifest.docs.find(d => d.meta.id === id);
    }
    private saveDrafts() {
        write(LOCAL_MAP_DRAFTS_KEY, Object.keys(this.drafts).length ? JSON.stringify(this.drafts) : null);
    }
    private draft(id: string, value: Draft | null) {
        if (value)
            this.drafts[id] = value;
        else
            delete this.drafts[id];
        this.saveDrafts();
    }
    /** Answers the same requests the development server's file editor does. */
    request: EditorRequest = async (method, path, body) => {
        try {
            const [route, query = ""] = path.split("?");
            const id = new URLSearchParams(query).get("id") ?? "";
            if (method === "GET" && route === "doc")
                return await this.getDoc(id);
            if (method === "PUT" && route === "doc")
                return await this.putDoc(saveRequest.parse(body));
            if (method === "PUT" && route === "draft") {
                const request = draftRequest.parse(body);
                if (!this.find(request.id))
                    return json({ error: `unknown doc id: ${request.id}` }, 404);
                if (request.slot === "discarded")
                    return json({ outcome: "discarded" });
                if (request.body === undefined)
                    return json({ error: "id and body are required" }, 400);
                this.draft(request.id, { body: request.body, reason: "conflict", errors: [], savedAt: new Date().toISOString() });
                return json({ outcome: "drafted", reason: "conflict" });
            }
            if (method === "DELETE" && route === "draft") {
                if (Object.hasOwn(this.drafts, id))
                    this.draft(id, null);
                return json({ ok: true });
            }
            if (method === "GET" && route === "complete")
                return json({ nodes: this.docs().map(d => ({ id: d.meta.id, label: d.meta.label ?? d.meta.id, layer: d.meta.layer })), refs: Object.entries(mergeManifest(this.seed, this.manifest).references).map(([key, ref]) => ({ key, title: ref.title })) });
            if (method === "GET" && route === "create-options") {
                const config = this.seed.config.layersConfig;
                return json({ layers: { ...config.layers, ...config.auxiliary }, gates: config.gates });
            }
            if (method === "POST" && route === "create")
                return await this.create(body);
            return json({ error: "This action is not available for a map kept in the browser." }, 404);
        }
        catch (error) {
            return json({ error: message(error).join("\n") }, 400);
        }
    };
    private async getDoc(id: string) {
        const doc = this.find(id);
        if (!doc)
            return json({ error: `unknown doc id: ${id}` }, 404);
        const { layer, ...frontmatter } = doc.meta;
        if (layer === "edge")
            delete frontmatter.id;
        const draft = Object.hasOwn(this.drafts, id) ? this.drafts[id] : undefined;
        return json({ id, source: `local/${id}`, layer, body: doc.body, hash: await docHash(doc), frontmatter, formSchema: formSchemaFor(layer), draft });
    }
    private async putDoc(save: z.infer<typeof saveRequest>) {
        const doc = this.find(save.id);
        if (!doc)
            return json({ error: `unknown doc id: ${save.id}` }, 404);
        if (await docHash(doc) !== save.baseHash)
            return json({ error: "document changed since it was read", currentHash: await docHash(doc), currentBody: doc.body }, 409);
        let meta = doc.meta;
        let errors: string[] = [];
        if (save.set || save.unset?.length) {
            const merged: Record<string, unknown> = { ...doc.meta, ...(save.set ?? {}) };
            for (const key of save.unset ?? [])
                delete merged[key];
            if (merged.layer !== doc.meta.layer || (doc.meta.layer !== "edge" && merged.id !== doc.meta.id))
                errors = ["The ID and type of an existing node cannot be changed."];
            else
                try {
                    meta = parseManifestMeta(merged);
                    if (meta.id !== doc.meta.id)
                        errors = ["An edge's endpoints cannot be changed."];
                }
                catch (error) {
                    errors = message(error);
                }
        }
        const next = { meta, body: save.body ?? doc.body };
        const drafted = (reason: string[]) => {
            this.draft(save.id, { body: next.body, reason: "schema", errors: reason, savedAt: new Date().toISOString() });
            return json({ outcome: "drafted", reason: "schema", hash: save.baseHash, changed: false, errors: reason, indexChanged: false });
        };
        if (errors.length)
            return drafted(errors);
        if (normalized(next) === normalized({ meta: doc.meta, body: doc.body })) {
            if (Object.hasOwn(this.drafts, save.id))
                this.draft(save.id, null);
            return json({ outcome: "applied", hash: save.baseHash, changed: false, errors: [], indexChanged: false });
        }
        try {
            await this.replace({ ...this.manifest, docs: this.manifest.docs.map(d => d.meta.id === save.id ? next : d) });
        }
        catch (error) {
            return drafted(message(error));
        }
        if (Object.hasOwn(this.drafts, save.id))
            this.draft(save.id, null);
        return json({ outcome: "applied", hash: await docHash(next), changed: true, errors: [], warnings: [], indexChanged: true });
    }
    private async create(input: unknown) {
        const request = creation.parse(input);
        const layer = request.meta.layer;
        if (!isManifestLayer(layer) || layer === "edge")
            return json({ error: "Choose a supported node or group type." }, 400);
        const meta = parseManifestMeta(request.meta);
        if (this.docs().some(d => d.meta.id === meta.id))
            return json({ error: "That ID already exists. Choose a different ID." }, 400);
        const changes = new Map<string, ManifestDoc>([[meta.id, { meta, body: request.body }]]);
        const memberLayer = GROUP_MEMBERS[layer];
        if (memberLayer) {
            // A node belongs to one display group. Moving it must leave every group valid.
            for (const doc of this.manifest.docs.filter(d => d.meta.layer === layer && d.meta.members.some((id: string) => meta.members.includes(id))))
                changes.set(doc.meta.id, { ...doc, meta: parseManifestMeta({ ...doc.meta, members: doc.meta.members.filter((id: string) => !meta.members.includes(id)) }) });
        }
        else if (Object.values(GROUP_MEMBERS).includes(layer)) {
            const group = this.manifest.docs.find(d => d.meta.id === request.group && GROUP_MEMBERS[d.meta.layer] === layer);
            if (!group)
                return json({ error: "Choose a group for this node." }, 400);
            changes.set(group.meta.id, { ...group, meta: parseManifestMeta({ ...group.meta, members: [...group.meta.members, meta.id] }) });
        }
        const docs = [...this.manifest.docs.map(d => changes.get(d.meta.id) ?? d), changes.get(meta.id)!];
        try {
            await this.replace({ ...this.manifest, docs });
        }
        catch (error) {
            return json({ error: message(error).join("\n") }, 400);
        }
        return json({ sources: [`local/${meta.id}`] });
    }
}
export async function openLocalMap(): Promise<LocalMapStore> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/map-source.json`);
    if (!response.ok)
        throw Error(`The map source could not be loaded (HTTP ${response.status}).`);
    // A build-produced asset from this site, not user content.
    return LocalMapStore.open(await response.json() as MapSeed);
}
