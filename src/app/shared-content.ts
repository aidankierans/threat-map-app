import { serviceRequest } from "./hosting.js";
export type SharedFields = Record<string, string>;
export interface SharedRevision {
    id: string;
    resource: string;
    parent: string;
    fields: SharedFields;
    author: string;
    created: string;
    summary: string;
    operation?: "unknown" | "create" | "revise" | "restore";
    restore?: string;
}
export interface SharedCatalog {
    editable: boolean;
    revisions: SharedRevision[];
    mode?: "local";
}
export class SharedRequestError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}
export async function sharedRequest<T>(path = "", body?: unknown): Promise<T> {
    const editor = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("editor");
    const response = await serviceRequest("content", { path, body, editor });
    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new SharedRequestError(data?.error ?? "Shared editing is unavailable. Sign in again; your draft has not been published.", response.status);
    }
    if (response.headers && !response.headers.get("content-type")?.includes("application/json"))
        throw new SharedRequestError("The shared-content endpoint did not return JSON. Check your hosting adapter.", 502);
    return response.json();
}
export function refreshCitations(html: string, references: Record<string, {
    url: string;
    title: string;
}>): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const link of doc.querySelectorAll<HTMLAnchorElement>("a[data-cite]")) {
        const reference = references[link.dataset.cite ?? ""];
        if (!reference)
            continue;
        if (/^https?:\/\//i.test(reference.url))
            link.setAttribute("href", reference.url);
        else
            link.removeAttribute("href");
        link.title = reference.title;
        link.setAttribute("aria-label", `Source: ${reference.title}`);
    }
    return doc.body.innerHTML;
}
export function plainText(html: string): string {
    const doc = new DOMParser().parseFromString(html.replace(/<\/(p|h[1-6]|li|div)>/g, "$&\n\n"), "text/html");
    return doc.body.textContent?.trim() ?? "";
}
