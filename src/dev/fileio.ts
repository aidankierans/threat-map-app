import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
export interface DocFile {
    raw: string;
    prefix: string;
    body: string;
    hash: string;
}
const FENCE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;
export function parseDocFile(raw: string): DocFile {
    const m = raw.match(FENCE);
    if (!m)
        throw new Error("file has no frontmatter fence");
    const prefix = m[0];
    const body = raw.slice(prefix.length).replace(/^\n+/, "").replace(/\n+$/, "");
    return { raw, prefix, body, hash: sha256(raw) };
}
export function composeDoc(prefix: string, body: string): string {
    const trimmed = body.replace(/^\n+/, "").replace(/\n+$/, "");
    return trimmed === "" ? `${prefix}\n\n` : `${prefix}\n${trimmed}\n`;
}
export interface FrontmatterPatch {
    set?: Record<string, unknown>;
    unset?: string[];
}
export function applyFrontmatterPatch(raw: string, patch: FrontmatterPatch, defaults: Record<string, unknown> = {}): string {
    const { prefix, body } = parseDocFile(raw);
    const yamlText = prefix.replace(/^---\r?\n/, "").replace(/\r?\n---[ \t]*\r?\n$/, "\n");
    const doc = parseDocument(yamlText);
    for (const key of patch.unset ?? [])
        doc.delete(key);
    for (const [key, value] of Object.entries(patch.set ?? {})) {
        if (!doc.has(key) && key in defaults && deepEqual(value, defaults[key]))
            continue;
        doc.set(key, value);
    }
    const newYaml = doc.toString({ flowCollectionPadding: false, lineWidth: 0 });
    return composeDoc(`---\n${newYaml}---\n`, body);
}
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b)
        return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
        return false;
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length)
        return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
