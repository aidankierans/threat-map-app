import { Marked } from "marked";
import type { Reference } from "../types.js";
export interface RenderContext {
    resolveId: (id: string) => {
        id: string;
        label: string;
        layer: string;
    } | undefined;
    references: Record<string, Reference>;
    source: string;
    safe?: boolean;
}
export interface RenderResult {
    html: string;
    cites: string[];
    errors: string[];
}
function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
const marked = new Marked({ gfm: true, breaks: false });
export function renderMarkdown(md: string, ctx: RenderContext): RenderResult {
    const errors: string[] = [];
    const cites: string[] = [];
    const placeholders = new Map<string, string>();
    let counter = 0;
    const stash = (html: string): string => {
        const token = `\0PH${counter++}\0`;
        placeholders.set(token, html);
        return token;
    };
    const segments = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    const transformed = segments
        .map((seg, idx) => {
        if (idx % 2 === 1)
            return seg;
        let s = seg;
        s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, rawId: string, rawLabel?: string) => {
            const id = rawId.trim();
            const target = ctx.resolveId(id);
            if (!target) {
                errors.push(`${ctx.source}: unknown cross-reference [[${id}]]`);
                return stash(`<span class="xref xref-broken" title="unknown reference">${esc(rawLabel ?? id)}</span>`);
            }
            const label = (rawLabel ?? target.label).trim();
            return stash(`<a class="xref" href="#/node/${encodeURIComponent(target.id)}" ` +
                `data-xref="${esc(target.id)}" data-layer="${esc(target.layer)}">${esc(label)}</a>`);
        });
        s = s.replace(/\[@([^\]]+)\]/g, (_m, inner: string) => {
            const keys = inner
                .split(";")
                .map((k) => k.trim().replace(/^@/, ""))
                .filter(Boolean);
            const rendered = keys.map((key) => {
                const ref = ctx.references[key];
                if (!ref) {
                    errors.push(`${ctx.source}: unknown citation key [@${key}]`);
                    return `<span class="cite cite-broken" title="unknown citation key">[?]</span>`;
                }
                cites.push(key);
                return (`<a class="cite" data-cite="${esc(key)}" href="${esc(ref.url)}" ` +
                    `target="_blank" rel="noopener" title="${esc(ref.title)}" ` +
                    `aria-label="Source: ${esc(ref.title)}">[source]</a>`);
            });
            return stash(rendered.join(", "));
        });
        return s;
    })
        .join("");
    const parser = ctx.safe ? new Marked({ gfm: true, breaks: false, renderer: {
            html: ({ text }) => esc(text),
            image: ({ text }) => esc(text),
            link(this: import("marked").Renderer, { href, tokens }: import("marked").Tokens.Link) {
                const label = this.parser.parseInline(tokens);
                return /^https?:\/\//i.test(href) || href.startsWith("#/") ? `<a href="${esc(href)}" rel="noreferrer" target="_blank">${label}</a>` : label;
            },
        } }) : marked;
    let html = parser.parse(transformed, { async: false }) as string;
    for (const [token, replacement] of placeholders) {
        html = html.split(token).join(replacement);
    }
    return { html, cites: [...new Set(cites)], errors };
}
export function leadSentence(md: string, maxLength = 240): string {
    const plain = md
        .split(/\n#{1,6}\s/)[0]
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/\[@[^\]]+\]/g, "")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const m = plain.match(/^[\s\S]*?[.!?](?=\s+[A-Z(“"']|\s*$)/);
    const first = (m ? m[0] : plain).trim();
    return first.length > maxLength ? first.slice(0, maxLength - 1).trimEnd() + "…" : first;
}
