import type { Actor, AnalysisDocument, OccurrenceRef, PresentationStep, ReaderJudgment, ReaderState, StoryContraction } from "./reader-state.js";
import { occurrenceKey, tourWarnings } from "./tour.js";
export type CaseAction = {
    type: "open";
    state: ReaderState;
} | {
    type: "restore-reader";
    state: ReaderState | null;
} | {
    type: "undo" | "redo";
} | {
    type: "insert";
    after: number;
    kind: "moment" | "caption";
    id: string;
} | {
    type: "delete";
    step: string;
} | {
    type: "move";
    step: string;
    to: number;
} | {
    type: "text";
    step: string;
    title?: string;
    caption?: string;
    narrative?: string;
    regenerate?: boolean;
} | {
    type: "claim-text";
    ref: OccurrenceRef;
    patch: NonNullable<import("./reader-state.js").StoryOccurrence["presentation"]>;
    reset?: boolean;
} | {
    type: "assign";
    step: string;
    ref: OccurrenceRef;
    remove?: boolean;
} | {
    type: "place";
    step: string;
    actor: string;
    at: OccurrenceRef;
} | {
    type: "actor-add";
    actor: Actor;
} | {
    type: "actor-remove";
    actor: string;
} | {
    type: "contract";
    step: string;
    contraction: StoryContraction;
} | {
    type: "acknowledge";
    step: string;
} | {
    type: "revert";
    step: string;
    derived: PresentationStep;
} | {
    type: "judge";
    step: string;
    judgment: ReaderJudgment;
    clear?: boolean;
} | {
    type: "details";
    title?: string;
    premise?: string;
    interpretation?: string;
};
export function openCase(doc: AnalysisDocument, local = false): ReaderState {
    return { baseline: structuredClone(doc), savePolicy: local ? "continue" : "fork", draft: { map: structuredClone(doc.map), content: structuredClone(doc.content) }, undo: [], redo: [], ui: { activeStory: doc.content.stories[0]?.id ?? null, activeOccurrence: null, expandedContractions: [] } };
}
export function draftDocument(state: ReaderState): AnalysisDocument {
    return { kind: "threat-map/analysis", schemaVersion: 1, identity: state.baseline?.identity ?? { analysisId: "draft", revisionId: "draft" }, createdAt: state.baseline?.createdAt ?? new Date().toISOString(), ...state.draft };
}
export function caseReducer(state: ReaderState | null, action: CaseAction): ReaderState | null {
    if (action.type === "open" || action.type === "restore-reader")
        return action.state;
    if (!state)
        return state;
    if (action.type === "undo" || action.type === "redo") {
        const from = action.type === "undo" ? state.undo : state.redo;
        if (!from.length)
            return state;
        return { ...state, draft: from[from.length - 1],
            undo: action.type === "undo" ? from.slice(0, -1) : [...state.undo, state.draft].slice(-50),
            redo: action.type === "redo" ? from.slice(0, -1) : [...state.redo, state.draft].slice(-50) };
    }
    const draft = structuredClone(state.draft);
    const c = draft.content;
    const steps = c.presentation.steps;
    const step = "step" in action ? steps.find(s => s.id === action.step) : undefined;
    switch (action.type) {
        case "insert":
            steps.splice(action.after + 1, 0, { id: action.id, kind: action.kind, title: action.kind === "caption" ? "Author's note" : "New moment", caption: "", occurrences: [], actors: [], introduces: [], contractions: [], origin: "authored" });
            break;
        case "delete":
            if (steps.length > 1 && step)
                steps.splice(steps.indexOf(step), 1);
            break;
        case "move":
            if (step) {
                steps.splice(steps.indexOf(step), 1);
                steps.splice(Math.max(0, Math.min(steps.length, action.to)), 0, step);
            }
            break;
        case "text":
            if (step) {
                if (action.title !== undefined)
                    step.title = action.title;
                if (action.caption !== undefined)
                    step.caption = action.caption;
                if (action.narrative !== undefined)
                    step.narrative = action.narrative;
                if (action.regenerate)
                    delete step.narrative;
            }
            break;
        case "claim-text":
            {
                const claim = c.stories.find(s => s.id === action.ref.story)?.occurrences.find(o => o.id === action.ref.occurrence);
                if (claim) {
                    if (action.reset)
                        delete claim.presentation;
                    else
                        claim.presentation = { ...claim.presentation, ...action.patch };
                }
            }
            break;
        case "assign":
            if (step && step.kind === "moment") {
                for (const s of steps) {
                    const before = s.occurrences.length;
                    s.occurrences = s.occurrences.filter(r => occurrenceKey(r) !== occurrenceKey(action.ref));
                    if (before !== s.occurrences.length)
                        s.origin = "authored";
                }
                if (!action.remove)
                    step.occurrences.push(action.ref);
            }
            break;
        case "place":
            if (step) {
                step.actors = step.actors.filter(p => p.actor !== action.actor);
                step.actors.push({ actor: action.actor, at: action.at });
            }
            break;
        case "actor-add":
            if (!c.actors.some(a => a.id === action.actor.id))
                c.actors.push(action.actor);
            break;
        case "actor-remove":
            if (c.context.scopes.some(s => s.actor === action.actor) || c.archivedStories.some(a => a.context.scopes.some(s => s.actor === action.actor)))
                return state;
            c.actors = c.actors.filter(a => a.id !== action.actor);
            steps.forEach(s => { if (s.actors.some(p => p.actor === action.actor))
                s.origin = "authored"; s.actors = s.actors.filter(p => p.actor !== action.actor); });
            break;
        case "contract":
            if (step) {
                const key = JSON.stringify(action.contraction);
                const present = step.contractions.some(r => JSON.stringify(r) === key);
                step.contractions = step.contractions.filter(r => JSON.stringify(r) !== key);
                if (!present)
                    step.contractions.push(action.contraction);
            }
            break;
        case "acknowledge":
            if (step)
                step.acknowledgedOutOfOrder = true;
            break;
        case "revert":
            if (step) {
                const keys = new Set(action.derived.occurrences.map(occurrenceKey));
                for (const s of steps)
                    if (s !== step) {
                        if (s.occurrences.some(r => keys.has(occurrenceKey(r))))
                            s.origin = "authored";
                        s.occurrences = s.occurrences.filter(r => !keys.has(occurrenceKey(r)));
                    }
                steps[steps.indexOf(step)] = { ...structuredClone(action.derived), id: step.id };
            }
            break;
        case "judge":
            {
                const j = action.judgment;
                const old = c.judgments.filter(x => JSON.stringify(x.target) === JSON.stringify(j.target));
                c.judgments = c.judgments.filter(x => !old.includes(x));
                steps.forEach(s => { s.introduces = s.introduces.filter(id => !old.some(x => x.id === id)); });
                if (!action.clear && step) {
                    c.judgments.push(j);
                    step.introduces.push(j.id);
                }
            }
            break;
        case "details":
            for (const field of ["title", "premise", "interpretation"] as const)
                if (action[field] !== undefined)
                    c[field] = action[field];
            break;
    }
    if (step && action.type !== "revert")
        step.origin = "authored";
    if (["move", "assign", "insert", "delete", "revert"].includes(action.type)) {
        const signature = (doc: AnalysisDocument, id: string) => JSON.stringify(tourWarnings(doc).filter(w => w.stepId === id && w.kind === "out-of-order").map(w => [w.occurrence, w.prerequisite, w.laterStep]));
        const old = draftDocument(state);
        const next = { ...old, ...draft };
        for (const s of steps)
            if (("step" in action && s.id === action.step) || signature(old, s.id) !== signature(next, s.id))
                delete s.acknowledgedOutOfOrder;
    }
    if (JSON.stringify(draft) === JSON.stringify(state.draft))
        return state;
    return { ...state, draft, undo: [...state.undo, state.draft].slice(-50), redo: [] };
}
