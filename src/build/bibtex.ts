import type { Reference } from "../types.js";
export interface BibEntry {
    key: string;
    type: string;
    fields: Record<string, string>;
}
function readBraced(src: string, start: number): {
    value: string;
    next: number;
} {
    let depth = 0;
    let i = start;
    while (i < src.length) {
        const ch = src[i];
        if (ch === "\\") {
            i += 2;
            continue;
        }
        if (ch === "{")
            depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0)
                return { value: src.slice(start + 1, i), next: i + 1 };
        }
        i++;
    }
    throw new Error("Unterminated '{' in references.bib");
}
function parseEntryBody(body: string): {
    key: string;
    fields: Record<string, string>;
} {
    let i = 0;
    let depth = 0;
    const keyStart = i;
    while (i < body.length) {
        const ch = body[i];
        if (ch === "{")
            depth++;
        else if (ch === "}")
            depth--;
        else if (ch === "," && depth === 0)
            break;
        i++;
    }
    const key = body.slice(keyStart, i).trim();
    i++;
    const fields: Record<string, string> = {};
    while (i < body.length) {
        while (i < body.length && /[\s,]/.test(body[i]))
            i++;
        if (i >= body.length)
            break;
        const nameStart = i;
        while (i < body.length && /[A-Za-z0-9_-]/.test(body[i]))
            i++;
        const name = body.slice(nameStart, i).toLowerCase();
        if (!name)
            break;
        while (i < body.length && /\s/.test(body[i]))
            i++;
        if (body[i] !== "=")
            break;
        i++;
        while (i < body.length && /\s/.test(body[i]))
            i++;
        let value: string;
        if (body[i] === "{") {
            const r = readBraced(body, i);
            value = r.value;
            i = r.next;
        }
        else if (body[i] === '"') {
            const start = ++i;
            while (i < body.length && body[i] !== '"') {
                if (body[i] === "\\")
                    i++;
                i++;
            }
            value = body.slice(start, i);
            i++;
        }
        else {
            const start = i;
            while (i < body.length && body[i] !== ",")
                i++;
            value = body.slice(start, i).trim();
        }
        fields[name] = value.replace(/^\{(.*)\}$/s, "$1").replace(/\s+/g, " ").trim();
    }
    return { key, fields };
}
export function parseBibtex(src: string): BibEntry[] {
    const entries: BibEntry[] = [];
    let i = 0;
    while (i < src.length) {
        if (/\s/.test(src[i])) {
            i++;
            continue;
        }
        if (src[i] === "%") {
            const nl = src.indexOf("\n", i);
            i = nl === -1 ? src.length : nl + 1;
            continue;
        }
        if (src[i] !== "@") {
            i++;
            continue;
        }
        i++;
        const typeStart = i;
        while (i < src.length && /[A-Za-z]/.test(src[i]))
            i++;
        const type = src.slice(typeStart, i).toLowerCase();
        while (i < src.length && /\s/.test(src[i]))
            i++;
        if (src[i] !== "{")
            continue;
        const { value: body, next } = readBraced(src, i);
        i = next;
        if (type === "comment" || type === "preamble" || type === "string")
            continue;
        const { key, fields } = parseEntryBody(body);
        if (key)
            entries.push({ key, type, fields });
    }
    return entries;
}
function unescapeBib(s: string): string {
    return s
        .replace(/\\textasciitilde\{\}/g, "~")
        .replace(/\\([&%#_$])/g, "$1")
        .trim();
}
export function toReferences(entries: BibEntry[]): Record<string, Reference> {
    const refs: Record<string, Reference> = {};
    for (const e of entries) {
        const f = e.fields;
        const url = f.url ||
            (f.eprint ? `https://arxiv.org/abs/${f.eprint}` : "") ||
            (f.doi ? `https://doi.org/${f.doi}` : "");
        refs[e.key] = {
            key: e.key,
            title: unescapeBib(f.title ?? e.key),
            url,
            authors: f.author ? unescapeBib(f.author) : undefined,
            year: f.year ?? (f.date ? f.date.slice(0, 4) : undefined),
            venue: f.journal ?? f.booktitle ?? f.publisher ?? f.howpublished,
            urldate: f.urldate,
        };
    }
    return refs;
}
export function readReferences(src: string): Record<string, Reference> {
    return toReferences(parseBibtex(src));
}
export function formatReference(ref: Reference): string {
    return [ref.authors, ref.year, ref.title, ref.venue].filter(Boolean).join(". ");
}
