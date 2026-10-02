import type { GraphIndex } from "../../types.js";
export interface EditorContext {
    token: string;
    index: GraphIndex;
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
const base = () => `${import.meta.env.BASE_URL}__editor`;
const headers = (ctx: EditorContext) => ({
    "x-editor-token": ctx.token,
    "content-type": "application/json",
});
export async function getDoc(ctx: EditorContext, id: string): Promise<DocPayload> {
    const res = await fetch(`${base()}/doc?id=${encodeURIComponent(id)}`, {
        headers: headers(ctx),
    });
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
    const res = await fetch(`${base()}/doc`, {
        method: "PUT",
        headers: headers(ctx),
        body: JSON.stringify(payload),
        keepalive: options.keepalive ?? false,
    });
    if (res.status === 409) {
        const data = await res.json();
        return { conflict: true, currentHash: data.currentHash, currentBody: data.currentBody };
    }
    if (!res.ok)
        throw new Error(`save ${payload.id}: HTTP ${res.status}`);
    return res.json();
}
export async function putDraft(ctx: EditorContext, id: string, body: string): Promise<void> {
    const res = await fetch(`${base()}/draft`, {
        method: "PUT",
        headers: headers(ctx),
        body: JSON.stringify({ id, body }),
    });
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
    const res = await fetch(`${base()}/complete`, { headers: headers(ctx) });
    if (!res.ok)
        throw new Error(`completions: HTTP ${res.status}`);
    ctx.completions = (await res.json()) as Completions;
    return ctx.completions;
}
export async function putDiscarded(ctx: EditorContext, id: string): Promise<void> {
    const res = await fetch(`${base()}/draft`, {
        method: "PUT",
        headers: headers(ctx),
        body: JSON.stringify({ id, slot: "discarded" }),
    });
    if (!res.ok)
        throw new Error(`set aside ${id}: HTTP ${res.status}`);
}
export async function deleteDraft(ctx: EditorContext, id: string): Promise<void> {
    const res = await fetch(`${base()}/draft?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers(ctx),
    });
    if (!res.ok)
        throw new Error(`discard draft ${id}: HTTP ${res.status}`);
}
