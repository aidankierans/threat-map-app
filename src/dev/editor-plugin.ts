import { resolve, sep } from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import matter from "gray-matter";
import { ROOT, layersConfig } from "../build/config.js";
import { defaultsFor, formSchemaFor } from "./editor/form-schema.js";
import { applyCreation, planCreation, saveLocalCase, localPath } from './local-data.js';
import { parseCase } from '../app/case-codec.js';
import { runBuild, type BuildResult } from "../build/run.js";
import { SCHEMAS, type LayerName } from "../build/schema.js";
import type { GraphIndex } from "../types.js";
import { sha256, parseDocFile, composeDoc, applyFrontmatterPatch } from "./fileio.js";
import { rejectReason, type RequestFacts } from "./guards.js";
import { classifySave, deleteDraft, discardDraft, readDraft, sweepDrafts, writeDiscarded, writeDraft, } from "./drafts.js";
const WATCHED = ["content", "config", "references", "filters", "case-studies"];
const ARTIFACT_GLOBS = ["**/src/generated/**", "**/public/data/**"];
const INDEX_FILE = resolve(ROOT, "src/generated/reader-index.json");
const CONTENT_DIR = resolve(ROOT, "content") + sep;
export function stripLeads(index: GraphIndex): string {
    const clone: GraphIndex = JSON.parse(JSON.stringify(index));
    delete clone.mapBasis;
    delete clone.sourceKeys;
    for (const n of clone.nodes)
        n.lead = "";
    for (const d of Object.values(clone.edgeDocs))
        d.lead = "";
    return JSON.stringify(clone);
}
export function classifyRebuild(prev: GraphIndex, next: GraphIndex): "prose" | "reload" {
    return stripLeads(prev) === stripLeads(next) ? "prose" : "reload";
}
export { formSchemaFor };
interface SaveRequest {
    id: string;
    baseHash: string;
    body?: string;
    set?: Record<string, unknown>;
    unset?: string[];
}
function draftBody(text: string): string {
    try {
        return parseDocFile(text).body;
    }
    catch {
        return text;
    }
}
export function editorPlugin(): Plugin {
    let server: ViteDevServer;
    let current: BuildResult;
    let lastIndexKey: string | null = null;
    const token = randomUUID();
    const selfWrites = new Map<string, string>();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const log = (msg: string) => server.config.logger.info(`  \x1b[36m[editor]\x1b[0m ${msg}`, { timestamp: true });
    const invalidateIndexModule = () => {
        const graph = server.environments.client.moduleGraph;
        const mods = graph.getModulesByFile(INDEX_FILE);
        if (mods)
            for (const m of mods)
                graph.invalidateModule(m);
    };
    const rebuild = (reason: string) => {
        const t0 = performance.now();
        current = runBuild({ write: true });
        const ms = Math.round(performance.now() - t0);
        const key = stripLeads(current.index);
        const kind = lastIndexKey === null || key !== lastIndexKey ? "reload" : "prose";
        lastIndexKey = key;
        if (kind === "reload") {
            invalidateIndexModule();
            server.hot.send({ type: "full-reload" });
        }
        else {
            server.hot.send({ type: "custom", event: "threatmap:prose", data: current.prose });
            server.hot.send({ type: "custom", event: "threatmap:case-data", data: { mapBasis: current.index.mapBasis, sourceKeys: current.index.sourceKeys, caseStudies: current.index.caseStudies } });
        }
        const errs = current.errors.length ? ` · ${current.errors.length} error(s)` : "";
        log(`${reason} → ${kind} · ${ms}ms${errs}`);
        for (const e of current.errors)
            log(`  ✗ ${e}`);
        return kind;
    };
    const json = (res: ServerResponse, status: number, payload: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(payload));
    };
    const factsOf = (req: IncomingMessage): RequestFacts => ({
        remoteAddress: req.socket.remoteAddress,
        host: req.headers.host,
        origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
        secFetchSite: typeof req.headers["sec-fetch-site"] === "string"
            ? req.headers["sec-fetch-site"]
            : undefined,
        token: typeof req.headers["x-editor-token"] === "string"
            ? req.headers["x-editor-token"]
            : undefined,
    });
    const readBody = (req: IncomingMessage): Promise<string> => new Promise((resolvePromise, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
            size += c.length;
            if (size > 2 * 1024 * 1024) {
                reject(new Error("body too large"));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
    const locate = (id: string) => {
        const doc = current.docs.find((d) => d.meta.id === id);
        if (!doc)
            return null;
        const path = resolve(ROOT, doc.source);
        if (!path.startsWith(CONTENT_DIR) || !path.endsWith(".md"))
            return null;
        return { doc, path };
    };
    const handleGetDoc = (res: ServerResponse, id: string) => {
        const found = locate(id);
        if (!found)
            return json(res, 404, { error: `unknown doc id: ${id}` });
        const raw = readFileSync(found.path, "utf8");
        const file = parseDocFile(raw);
        const layer = found.doc.meta.layer as LayerName;
        const draft = readDraft(id);
        return json(res, 200, {
            id,
            source: found.doc.source,
            layer,
            body: file.body,
            hash: file.hash,
            frontmatter: matter(raw).data,
            formSchema: formSchemaFor(layer),
            draft: draft ? { body: draftBody(draft.text), ...draft.meta } : undefined,
        });
    };
    const handlePutDoc = (res: ServerResponse, save: SaveRequest) => {
        if (typeof save.id !== "string" || typeof save.baseHash !== "string") {
            return json(res, 400, { error: "id and baseHash are required" });
        }
        const found = locate(save.id);
        if (!found)
            return json(res, 404, { error: `unknown doc id: ${save.id}` });
        const raw = readFileSync(found.path, "utf8");
        if (sha256(raw) !== save.baseHash) {
            const file = parseDocFile(raw);
            return json(res, 409, {
                error: "file changed since it was read",
                currentHash: file.hash,
                currentBody: file.body,
            });
        }
        const layer = found.doc.meta.layer as LayerName;
        let next = raw;
        let schemaErrors: string[] = [];
        if (save.set || save.unset?.length) {
            const merged: Record<string, unknown> = { ...matter(raw).data, ...(save.set ?? {}) };
            for (const key of save.unset ?? [])
                delete merged[key];
            const parsed = SCHEMAS[layer].safeParse({ layer, ...merged });
            if (!parsed.success) {
                schemaErrors = parsed.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`);
            }
            next = applyFrontmatterPatch(raw, { set: save.set, unset: save.unset }, defaultsFor(layer));
        }
        if (typeof save.body === "string") {
            next = composeDoc(parseDocFile(next).prefix, save.body);
        }
        const outcome = classifySave({ schemaValid: schemaErrors.length === 0, conflict: false });
        if (outcome === "drafted") {
            writeDraft(save.id, next, {
                reason: "schema",
                errors: schemaErrors,
                baseHash: save.baseHash,
                savedAt: new Date().toISOString(),
            });
            if (readFileSync(found.path, "utf8") !== raw) {
                log(`✗ postcondition failed for ${save.id}: drafted save altered the real file`);
                return json(res, 500, { error: "draft postcondition failed" });
            }
            log(`⚠ ${save.id} → draft (schema: ${schemaErrors[0]})`);
            return json(res, 200, {
                outcome: "drafted",
                reason: "schema",
                hash: save.baseHash,
                changed: false,
                errors: schemaErrors,
                indexChanged: false,
            });
        }
        if (next === raw) {
            deleteDraft(save.id);
            return json(res, 200, {
                outcome: "applied",
                hash: save.baseHash,
                changed: false,
                errors: [],
                indexChanged: false,
            });
        }
        writeFileSync(found.path, next);
        selfWrites.set(found.path, sha256(next));
        deleteDraft(save.id);
        const onDisk = readFileSync(found.path, "utf8");
        if (onDisk !== next) {
            log(`✗ postcondition failed for ${save.id}: bytes on disk differ from composed write`);
            return json(res, 500, { error: "write postcondition failed" });
        }
        const kind = rebuild(`✎ ${save.id}`);
        return json(res, 200, {
            outcome: "applied",
            hash: sha256(next),
            changed: true,
            errors: current.errors,
            warnings: current.warnings,
            indexChanged: kind === "reload",
        });
    };
    const handlePutDraft = (res: ServerResponse, req: {
        id?: string;
        body?: string;
        slot?: string;
    }) => {
        if (typeof req.id !== "string") {
            return json(res, 400, { error: "id is required" });
        }
        const found = locate(req.id);
        if (!found)
            return json(res, 404, { error: `unknown doc id: ${req.id}` });
        if (req.slot === "discarded") {
            writeDiscarded(req.id, readFileSync(found.path, "utf8"));
            log(`⚠ ${req.id}: disk version set aside (.editor-drafts/${req.id}.discarded.md)`);
            return json(res, 200, { outcome: "discarded" });
        }
        if (typeof req.body !== "string") {
            return json(res, 400, { error: "id and body are required" });
        }
        const disk = readFileSync(found.path, "utf8");
        const text = composeDoc(parseDocFile(disk).prefix, req.body);
        writeDraft(req.id, text, {
            reason: "conflict",
            errors: [],
            baseHash: sha256(disk),
            savedAt: new Date().toISOString(),
        });
        log(`⚠ ${req.id} → draft (conflict)`);
        return json(res, 200, { outcome: "drafted", reason: "conflict" });
    };
    return {
        name: "threatmap-editor",
        apply: "serve",
        config: () => ({
            server: { watch: { ignored: ARTIFACT_GLOBS } },
        }),
        configureServer(s) {
            server = s;
            current = runBuild({ write: true });
            lastIndexKey = stripLeads(current.index);
            if (current.errors.length) {
                log(`content has ${current.errors.length} error(s) — the page still serves`);
                for (const e of current.errors)
                    log(`  ✗ ${e}`);
            }
            const kept = sweepDrafts((id) => {
                const found = locate(id);
                return found ? readFileSync(found.path, "utf8") : null;
            });
            if (kept.length)
                log(`unresolved draft(s): ${kept.join(", ")} — open the doc to restore`);
            server.middlewares.use((req, res, next) => {
                const url = req.url ?? "";
                if (!url.startsWith("/__editor/"))
                    return next();
                const reason = rejectReason(factsOf(req), token, {
                    requireToken: url !== "/__editor/token",
                });
                if (reason)
                    return json(res, 403, { error: reason });
                if (req.method === "GET" && url === "/__editor/token") {
                    return json(res, 200, { token });
                }
                if (req.method === "GET" && url === "/__editor/complete") {
                    return json(res, 200, {
                        nodes: current.docs.map((d) => ({
                            id: d.meta.id,
                            label: d.meta.label ?? d.meta.id,
                            layer: d.meta.layer,
                        })),
                        refs: Object.entries(current.references).map(([key, ref]) => ({
                            key,
                            title: ref.title,
                        })),
                    });
                }
                if (req.method === 'GET' && url === '/__editor/create-options') {
                    return json(res,200,{layers:{...layersConfig.layers,...layersConfig.auxiliary},gates:layersConfig.gates});
                }
                if (req.method === 'GET' && url === '/__editor/case-drafts') {
                    const dir=localPath(ROOT,'.editor-drafts/cases');
                    const drafts=existsSync(dir)?readdirSync(dir).filter(f=>f.endsWith('.json')).flatMap(file=>{
                        try{return [parseCase(readFileSync(localPath(ROOT,`.editor-drafts/cases/${file}`),'utf8'))];}catch{return [];}
                    }):[];
                    return json(res,200,{drafts});
                }
                if(req.method==='POST' && ['/__editor/create','/__editor/case','/__editor/case-draft'].includes(url)) {
                    readBody(req).then(text=>{
                        const payload=JSON.parse(text);
                        if(url==='/__editor/create'){
                            const changes=planCreation(payload,runBuild({write:false}));
                            const sources=applyCreation(ROOT,changes);
                            for(const change of changes)selfWrites.set(resolve(ROOT,change.source),sha256(change.text));
                            json(res,200,{sources});rebuild('created local node or group');return;
                        }
                        const result=saveLocalCase(ROOT,payload,url==='/__editor/case-draft');
                        selfWrites.set(resolve(ROOT,result.source),sha256(readFileSync(resolve(ROOT,result.source))));
                        json(res,200,{source:result.source});
                        if(url==='/__editor/case')rebuild('saved local case revision');
                    }).catch((error:Error)=>json(res,400,{error:error.message}));
                    return;
                }
                if (req.method === "GET" && url.startsWith("/__editor/doc?")) {
                    const id = new URL(url, "http://localhost").searchParams.get("id");
                    if (!id)
                        return json(res, 400, { error: "id is required" });
                    return handleGetDoc(res, id);
                }
                if (req.method === "PUT" && (url === "/__editor/doc" || url === "/__editor/draft")) {
                    readBody(req)
                        .then((text) => {
                        let payload: SaveRequest;
                        try {
                            payload = JSON.parse(text);
                        }
                        catch {
                            return json(res, 400, { error: "body is not valid JSON" });
                        }
                        return url === "/__editor/doc"
                            ? handlePutDoc(res, payload)
                            : handlePutDraft(res, payload);
                    })
                        .catch((err: Error) => json(res, 400, { error: err.message }));
                    return;
                }
                if (req.method === "DELETE" && url.startsWith("/__editor/draft?")) {
                    const id = new URL(url, "http://localhost").searchParams.get("id");
                    if (!id || !locate(id))
                        return json(res, 404, { error: "unknown doc id" });
                    const hadDraft = discardDraft(id);
                    log(hadDraft
                        ? `draft for ${id} set aside (.editor-drafts/${id}.discarded.md)`
                        : `no draft parked for ${id}`);
                    return json(res, 200, { deleted: true });
                }
                return json(res, 404, { error: "no such editor endpoint" });
            });
            const watchedRoots = WATCHED.map((d) => resolve(ROOT, d));
            for (const dir of watchedRoots)
                server.watcher.add(dir);
            const onFsEvent = (absPath: string) => {
                if (!watchedRoots.some((dir) => absPath.startsWith(dir + "/")))
                    return;
                const expected = selfWrites.get(absPath);
                if (expected !== undefined) {
                    selfWrites.delete(absPath);
                    const stillSame = existsSync(absPath) && sha256(readFileSync(absPath)) === expected;
                    if (stillSame)
                        return;
                }
                clearTimeout(debounce);
                debounce = setTimeout(() => rebuild(absPath.slice(ROOT.length + 1)), 80);
            };
            server.watcher.on("change", onFsEvent);
            server.watcher.on("add", onFsEvent);
            server.watcher.on("unlink", onFsEvent);
        },
    };
}
