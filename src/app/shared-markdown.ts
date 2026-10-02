import { Marked } from "marked";
import type { GraphIndex, Reference } from "../types.js";
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const options = { renderer: {
        html: ({ text }) => escape(text),
        link(this: import("marked").Renderer, { href, tokens }: import("marked").Tokens.Link) {
            const label = this.parser.parseInline(tokens);
            return /^https?:\/\//i.test(href) || href.startsWith("#/") ? `<a href="${escape(href)}" rel="noreferrer" target="_blank">${label}</a>` : label;
        },
        image: ({ text }: import("marked").Tokens.Image) => escape(text),
    } } satisfies import("marked").MarkedExtension;
export function sharedMarkdown(text: string, index?: GraphIndex, references: Record<string, Reference> = {}): string {
    const markdown = new Marked(options);
    markdown.use({ extensions: [{
                name: "mapReference", level: "inline", start: source => source.indexOf("["),
                tokenizer(source) {
                    const match = /^(\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[@([^\]]+)\])/.exec(source);
                    if (match)
                        return { type: "mapReference", raw: match[0], id: match[2]?.trim(), label: match[3], keys: match[4] };
                },
                renderer(token) {
                    if (token.id) {
                        const node = index?.nodes.find(n => n.id === token.id);
                        return node ? `<a class="xref" data-xref="${escape(node.id)}" data-layer="${escape(node.layer)}" href="#/node/${encodeURIComponent(node.id)}">${escape(token.label ?? node.label)}</a>` : escape(token.label ?? token.id);
                    }
                    return String(token.keys).split(";").map(key => {
                        key = key.trim().replace(/^@/, "");
                        const ref = references[key];
                        return ref && /^https?:\/\//i.test(ref.url) ? `<a class="cite" data-cite="${escape(key)}" href="${escape(ref.url)}" title="${escape(ref.title)}" target="_blank" rel="noreferrer">[source]</a>` : escape(`[@${key}]`);
                    }).join(", ");
                },
            }] });
    return markdown.parse(text, { async: false });
}
