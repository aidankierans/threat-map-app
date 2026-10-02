import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { NODE_ID_PATTERN } from "../build/schema.js";
import { ROOT } from "../build/config.js";
export const DRAFTS_DIR = resolve(ROOT, ".editor-drafts");
const EDGE_KIND_PATTERN = /^[a-z][a-z-]*$/;
export function isValidDraftId(id: string): boolean {
    if (NODE_ID_PATTERN.test(id))
        return true;
    const parts = id.split("~");
    return (parts.length === 3 &&
        NODE_ID_PATTERN.test(parts[0]) &&
        NODE_ID_PATTERN.test(parts[1]) &&
        EDGE_KIND_PATTERN.test(parts[2]));
}
export type SaveOutcome = "applied" | "drafted";
export function classifySave(facts: {
    schemaValid: boolean;
    conflict: boolean;
}): SaveOutcome {
    return facts.schemaValid && !facts.conflict ? "applied" : "drafted";
}
export interface DraftMeta {
    reason: "schema" | "conflict";
    errors: string[];
    baseHash: string;
    savedAt: string;
}
export interface Draft {
    text: string;
    meta: DraftMeta;
}
function pathsFor(id: string, variant = ""): {
    text: string;
    meta: string;
} {
    if (!isValidDraftId(id))
        throw new Error(`not a node or edge id: ${id}`);
    const text = resolve(DRAFTS_DIR, `${id}${variant}.md`);
    const meta = resolve(DRAFTS_DIR, `${id}${variant}.json`);
    if (!text.startsWith(DRAFTS_DIR + sep) || !meta.startsWith(DRAFTS_DIR + sep)) {
        throw new Error(`draft path escapes ${DRAFTS_DIR}`);
    }
    return { text, meta };
}
export function writeDraft(id: string, text: string, meta: DraftMeta): void {
    const paths = pathsFor(id);
    mkdirSync(DRAFTS_DIR, { recursive: true });
    writeFileSync(paths.text, text);
    writeFileSync(paths.meta, JSON.stringify(meta, null, 2) + "\n");
}
export function readDraft(id: string): Draft | null {
    const paths = pathsFor(id);
    if (!existsSync(paths.text))
        return null;
    const text = readFileSync(paths.text, "utf8");
    let meta: DraftMeta;
    try {
        meta = JSON.parse(readFileSync(paths.meta, "utf8"));
    }
    catch {
        meta = { reason: "conflict", errors: [], baseHash: "", savedAt: "" };
    }
    return { text, meta };
}
export function deleteDraft(id: string): void {
    const paths = pathsFor(id);
    rmSync(paths.text, { force: true });
    rmSync(paths.meta, { force: true });
}
export function writeDiscarded(id: string, text: string): void {
    const paths = pathsFor(id, ".discarded");
    mkdirSync(DRAFTS_DIR, { recursive: true });
    writeFileSync(paths.text, text);
    writeFileSync(paths.meta, JSON.stringify({ savedAt: new Date().toISOString() }, null, 2) + "\n");
}
export function readDiscarded(id: string): string | null {
    const paths = pathsFor(id, ".discarded");
    return existsSync(paths.text) ? readFileSync(paths.text, "utf8") : null;
}
export function discardDraft(id: string): boolean {
    const draft = readDraft(id);
    deleteDraft(id);
    if (!draft)
        return false;
    writeDiscarded(id, draft.text);
    return true;
}
export function sweepDrafts(fileTextFor: (id: string) => string | null): string[] {
    if (!existsSync(DRAFTS_DIR))
        return [];
    const kept: string[] = [];
    for (const entry of readdirSync(DRAFTS_DIR)) {
        if (!entry.endsWith(".md"))
            continue;
        const id = entry.slice(0, -3);
        if (!isValidDraftId(id))
            continue;
        const draft = readDraft(id);
        if (!draft)
            continue;
        const current = fileTextFor(id);
        if (current !== null && current === draft.text) {
            deleteDraft(id);
        }
        else {
            kept.push(id);
        }
    }
    return kept;
}
