import type { GraphIndex } from "../../types.js";
/** Sends one editor request: to the dev server's file editor, or to the browser's local map. */
export type EditorRequest = (method: "GET" | "PUT" | "POST" | "DELETE", path: string, body?: unknown, options?: {
    keepalive?: boolean;
}) => Promise<Response>;
export interface EditorContext {
    request: EditorRequest;
    index: GraphIndex;
    /** True when edits are kept in this browser instead of written to files. */
    local?: boolean;
    registry: Set<() => void>;
    completions?: Completions;
}
export interface DraftInfo {
    body: string;
    reason: "schema" | "conflict";
    errors: string[];
    savedAt: string;
}
export interface DocPayload {
    id: string;
    source: string;
    layer: string;
    body: string;
    hash: string;
    frontmatter: Record<string, unknown>;
    formSchema: Record<string, unknown>;
    draft?: DraftInfo;
}
export interface SaveResult {
    outcome: "applied" | "drafted";
    reason?: "schema";
    hash: string;
    changed: boolean;
    errors: string[];
    warnings?: string[];
    indexChanged: boolean;
}
export interface Conflict {
    conflict: true;
    currentHash: string;
    currentBody: string;
}
export function serverRequest(token: string): EditorRequest {
    return (method, path, body, options = {}) => fetch(`${import.meta.env.BASE_URL}__editor/${path}`, {
        method,
        headers: { "x-editor-token": token, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        keepalive: options.keepalive ?? false,
    });
}
export async function getDoc(ctx: EditorContext, id: string): Promise<DocPayload> {
    const res = await ctx.request("GET", `doc?id=${encodeURIComponent(id)}`);
    if (!res.ok)
        throw new Error(`GET doc ${id}: HTTP ${res.status}`);
    return res.json();
}
export async function putDoc(ctx: EditorContext, payload: {
    id: string;
    baseHash: string;
    body?: string;
    set?: Record<string, unknown>;
    unset?: string[];
}, options: {
    keepalive?: boolean;
} = {}): Promise<SaveResult | Conflict> {
    const res = await ctx.request("PUT", "doc", payload, options);
    if (res.status === 409) {
        const data = await res.json();
        return { conflict: true, currentHash: data.currentHash, currentBody: data.currentBody };
    }
    if (!res.ok)
        throw new Error(`save ${payload.id}: HTTP ${res.status}`);
    return res.json();
}
export async function putDraft(ctx: EditorContext, id: string, body: string): Promise<void> {
    const res = await ctx.request("PUT", "draft", { id, body });
    if (!res.ok)
        throw new Error(`draft ${id}: HTTP ${res.status}`);
}
export interface Completions {
    nodes: Array<{
        id: string;
        label: string;
        layer: string;
    }>;
    refs: Array<{
        key: string;
        title: string;
    }>;
}
export async function getCompletions(ctx: EditorContext): Promise<Completions> {
    if (ctx.completions)
        return ctx.completions;
    const res = await ctx.request("GET", "complete");
    if (!res.ok)
        throw new Error(`completions: HTTP ${res.status}`);
    ctx.completions = (await res.json()) as Completions;
    return ctx.completions;
}
export async function putDiscarded(ctx: EditorContext, id: string): Promise<void> {
    const res = await ctx.request("PUT", "draft", { id, slot: "discarded" });
    if (!res.ok)
        throw new Error(`set aside ${id}: HTTP ${res.status}`);
}
export async function deleteDraft(ctx: EditorContext, id: string): Promise<void> {
    const res = await ctx.request("DELETE", `draft?id=${encodeURIComponent(id)}`);
    if (!res.ok)
        throw new Error(`discard draft ${id}: HTTP ${res.status}`);
}
