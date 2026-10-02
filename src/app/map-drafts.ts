import type { MapDocument, MapFields } from "../shared-map.js";
export interface MapDraft {
    document: MapDocument;
    fields: MapFields;
    gates: string;
    summary: string;
    saved: number;
}
const prefix = "threat-map:map-draft:v1:";
const documentPrefix = (id: string) => `${prefix}${encodeURIComponent(id)}:`;
export function readMapDraft(id: string): MapDraft | null {
    try {
        let latest: MapDraft | null = null;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            if (!key.startsWith(documentPrefix(id)))
                continue;
            const draft = JSON.parse(localStorage.getItem(key)!);
            if (draft?.document?.id !== id || typeof draft.document.head !== "string" || typeof draft.document.baseRevision !== "string" || !draft.document.fields || !draft.fields || typeof draft.gates !== "string" || typeof draft.summary !== "string" || typeof draft.saved !== "number")
                continue;
            if (!latest || draft.saved > latest.saved)
                latest = draft;
        }
        return latest;
    }
    catch {
        return null;
    }
}
export function clearMapDraft(id: string): void {
    try {
        for (const key of Object.keys(localStorage))
            if (key.startsWith(documentPrefix(id)))
                localStorage.removeItem(key);
    }
    catch { }
}
export function saveMapDraft(draft: Omit<MapDraft, "saved">): boolean {
    try {
        const key = `${documentPrefix(draft.document.id)}${encodeURIComponent(draft.document.baseRevision)}:${encodeURIComponent(draft.document.head)}`;
        localStorage.setItem(key, JSON.stringify({ ...draft, saved: Date.now() }));
        for (const old of Object.keys(localStorage))
            if (old !== key && old.startsWith(documentPrefix(draft.document.id)))
                localStorage.removeItem(old);
        return true;
    }
    catch {
        return false;
    }
}
