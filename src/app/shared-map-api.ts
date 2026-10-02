import { serviceRequest } from "./hosting.js";
import type { MapCatalog, MapDocument, MapPreview, MapRevision, MapWrite } from "../shared-map.js";
export class MapRequestError extends Error {
    constructor(message: string, readonly status: number, readonly errors: string[] = []) { super(message); }
}
export async function mapRequest<T>(query = "", body?: MapWrite, editor = new URLSearchParams(window.location.search).has("editor")): Promise<T> {
    const response = await serviceRequest("map", { path: query, body, editor });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data)
        throw new MapRequestError(data?.error ?? "Shared map revisions could not be loaded.", response.status, data?.errors ?? []);
    return data as T;
}
export const loadSharedMap = () => mapRequest<MapCatalog>();
export const loadMapDocument = (id: string) => mapRequest<MapDocument>(`?document=${encodeURIComponent(id)}`, undefined, true);
export const previewMapChanges = (data: Omit<MapWrite, "action">) => mapRequest<MapPreview>("", { ...data, action: "preview" }, true);
export const publishMapChanges = (data: Omit<MapWrite, "action">) => mapRequest<MapCatalog>("", { ...data, action: "publish" }, true);
export const loadMapHistory = (before?: number, author = "", document = "") => mapRequest<{
    revisions: MapRevision[];
    next: number | null;
}>(`?log=1${before ? `&before=${before}` : ""}${author ? `&author=${encodeURIComponent(author)}` : ""}${document ? `&document=${encodeURIComponent(document)}` : ""}`, undefined, true);
export async function exportMapRevision(id: string): Promise<void> {
    const exported = await mapRequest<unknown>(`?export=${encodeURIComponent(id)}`, undefined, true);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `map-revision-${id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
