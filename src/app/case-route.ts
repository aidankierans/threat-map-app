import type { AnalysisDocument } from "./reader-state.js";
export interface CaseRoute {
    id?: string;
    shared?: string;
    legacyPayload?: boolean;
    step: number;
}
export function parseCaseRoute(hash: string): CaseRoute | null {
    const match = /^#?\/case(?:\/([^?]+))?(?:\?(.*))?$/.exec(hash);
    if (!match)
        return null;
    const params = new URLSearchParams(match[2] ?? "");
    const raw = params.get("step") ?? "0";
    const step = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
    try {
        return { ...(match[1] ? { id: decodeURIComponent(match[1]) } : {}), ...(params.has("shared") ? { shared: params.get("shared")! } : {}), ...(params.has("d") ? { legacyPayload: true } : {}), step };
    }
    catch {
        return { step };
    }
}
export function formatCaseRoute(route: CaseRoute): string {
    const params = new URLSearchParams();
    if (route.shared)
        params.set("shared", route.shared);
    if (route.step > 0)
        params.set("step", String(route.step));
    return `#/case${route.id ? `/${encodeURIComponent(route.id)}` : ""}${params.size ? `?${params}` : ""}`;
}
export function caseShareLink(shared: string, base: string, step = 0): string {
    const url = new URL(base);
    url.searchParams.delete("editor");
    url.hash = formatCaseRoute({ shared, step });
    return url.href;
}
export function caseListModel(shipped: AnalysisDocument[], local: AnalysisDocument[], revision: string, opened?: AnalysisDocument) {
    const rows = new Map<string, {
        document: AnalysisDocument;
        title: string;
        premise: string;
        mapStatus: string;
        source: string;
    }>();
    for (const [docs, source] of [[shipped, "shipped"], [local, "mine"], [opened ? [opened] : [], "opened from link"]] as const) {
        for (const doc of docs)
            if (!rows.has(doc.identity.revisionId))
                rows.set(doc.identity.revisionId, { document: doc, title: doc.content.title, premise: doc.content.premise.split("\n")[0], mapStatus: doc.map.revision === revision ? "Current map" : "Map changed; review needed", source });
    }
    return [...rows.values()];
}
