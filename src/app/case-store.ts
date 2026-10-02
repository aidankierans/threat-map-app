import type { AnalysisDocument, ReaderState } from "./reader-state.js";
import { CASE_DRAFT_KEY, CASE_KEY } from "./config.js";
import { exportCase, parseCase } from "./case-codec.js";
import { draftDocument, openCase } from "./case-edit.js";
export function loadCases(): AnalysisDocument[] {
    try {
        return (JSON.parse(localStorage.getItem(CASE_KEY) ?? "[]") as unknown[]).map(d => parseCase(d));
    }
    catch {
        return [];
    }
}
export function autosaveCase(state: ReaderState): boolean {
    try {
        localStorage.setItem(CASE_DRAFT_KEY, JSON.stringify({ baseline: state.baseline, draft: state.draft, savePolicy: state.savePolicy }));
        return true;
    }
    catch {
        return false;
    }
}
export function loadCaseDraft(): ReaderState | null {
    try {
        const value = JSON.parse(localStorage.getItem(CASE_DRAFT_KEY) ?? "null");
        if (!value)
            return null;
        const baseline = value.baseline ? parseCase(value.baseline) : null;
        const doc = parseCase({ kind: "threat-map/analysis", schemaVersion: 1, identity: baseline?.identity ?? { analysisId: "draft", revisionId: "draft" }, createdAt: baseline?.createdAt ?? "", ...value.draft });
        const state = openCase(doc);
        state.baseline = baseline;
        state.savePolicy = baseline ? value.savePolicy === "continue" ? "continue" : "fork" : "new";
        return state;
    }
    catch {
        return null;
    }
}
export function prepareCase(state: ReaderState, separate = false): AnalysisDocument {
    const unchanged = state.baseline && JSON.stringify(state.draft) === JSON.stringify({ map: state.baseline.map, content: state.baseline.content });
    if (unchanged && !separate)
        return state.baseline!;
    return parseCase({ ...draftDocument(state),
        identity: { analysisId: state.savePolicy === "continue" && !separate && state.baseline ? state.baseline.identity.analysisId : crypto.randomUUID(), revisionId: crypto.randomUUID() },
        ...(state.baseline ? { parent: state.baseline.identity } : {}), createdAt: new Date().toISOString(),
    });
}
export function saveCase(state: ReaderState, separate = false, prepared?: AnalysisDocument): {
    document: AnalysisDocument;
    state: ReaderState;
} {
    const doc = prepared ?? prepareCase(state, separate);
    if (doc === state.baseline)
        return { document: doc, state };
    const saved = (JSON.parse(localStorage.getItem(CASE_KEY) ?? "[]") as unknown[]).map(d => parseCase(d));
    const collision = saved.find(d => d.identity.revisionId === doc.identity.revisionId);
    if (collision && JSON.stringify(collision) !== JSON.stringify(doc))
        throw new Error("A different checkpoint already uses this revision ID.");
    localStorage.setItem(CASE_KEY, JSON.stringify(collision ? saved : [...saved, doc]));
    const next = { ...state, baseline: doc, savePolicy: "continue" as const };
    autosaveCase(next);
    return { document: doc, state: next };
}
export function downloadCase(doc: AnalysisDocument): void {
    const blob = new Blob([exportCase(doc)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.content.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "case-study"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
