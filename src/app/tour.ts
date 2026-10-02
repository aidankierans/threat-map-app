import type { Actor, AnalysisDocument, OccurrenceRef, StoryContraction } from "./reader-state.js";
export const occurrenceKey = (r: OccurrenceRef) => JSON.stringify([r.story, r.occurrence]);
export interface Warning {
    kind: "out-of-order" | "not-narrated";
    stepId: string;
    occurrence: OccurrenceRef;
    prerequisite?: OccurrenceRef;
    laterStep?: string;
    acknowledged: boolean;
    message: string;
}
function schedule(doc: AnalysisDocument): Map<string, number> {
    const at = new Map<string, number>();
    doc.content.presentation.steps.forEach((s, i) => s.occurrences.forEach(r => at.set(occurrenceKey(r), i)));
    for (const s of doc.content.stories) {
        const moments = doc.content.presentation.steps.flatMap((s, i) => s.kind === "moment" ? [i] : []);
        const destination = at.get(occurrenceKey({ story: s.id, occurrence: s.destinationOccurrence })) ?? moments[moments.length - 1] ?? Infinity;
        for (const o of s.occurrences) {
            const key = occurrenceKey({ story: s.id, occurrence: o.id });
            if (!at.has(key))
                at.set(key, destination);
        }
    }
    return at;
}
export function tourWarnings(doc: AnalysisDocument): Warning[] {
    const at = schedule(doc);
    const steps = doc.content.presentation.steps;
    const explicit = new Set(steps.flatMap(s => s.occurrences.map(occurrenceKey)));
    const warnings: Warning[] = [];
    for (const story of doc.content.stories)
        for (const o of story.occurrences) {
            const occurrence = { story: story.id, occurrence: o.id };
            const key = occurrenceKey(occurrence);
            const i = at.get(key)!;
            const step = steps[i] ?? steps[steps.length - 1];
            if (!explicit.has(key))
                warnings.push({ kind: "not-narrated", stepId: step.id, occurrence, acknowledged: false, message: `${o.node} has no named step; it appears with the outcome.` });
            if (o.argument.kind === "requirement")
                for (const m of o.argument.members) {
                    const prerequisite = { story: story.id, occurrence: m.occurrence };
                    const later = at.get(occurrenceKey(prerequisite))!;
                    if (later > i)
                        warnings.push({ kind: "out-of-order", stepId: step.id, occurrence, prerequisite, laterStep: steps[later].id,
                            acknowledged: !!step.acknowledgedOutOfOrder, message: `${o.node} is told before ${m.declared}, supplied in step ${later + 1} (${steps[later].title}). Explain this order in the author's note, or keep it.` });
                }
        }
    return warnings;
}
export interface TourState {
    current: Set<string>;
    established: Set<string>;
    later: Set<string>;
    actors: Array<{
        actor: Actor;
        node: string;
    }>;
    activeContractions: StoryContraction[];
    visibleJudgments: Set<string>;
    premise: string[];
    gapHere: boolean;
    limit: boolean;
    reasons: string[];
}
export function tourStateAt(doc: AnalysisDocument, stepIndex: number, opts: {
    limit?: boolean;
} = {}): TourState {
    const c = doc.content;
    const steps = c.presentation.steps;
    const i = Math.max(0, Math.min(steps.length - 1, stepIndex));
    const at = schedule(doc);
    const current = new Set<string>();
    const established = new Set<string>();
    const later = new Set<string>();
    const premise: string[] = [];
    let gapHere = false;
    for (const s of c.stories)
        for (const o of s.occurrences) {
            const when = at.get(occurrenceKey({ story: s.id, occurrence: o.id }))!;
            (when === i ? current : when < i ? established : later).add(o.node);
            if (o.argument.kind === "premise")
                premise.push(o.node);
            if (when === i && o.argument.kind === "requirement" && o.argument.ref.partial)
                gapHere = true;
        }
    current.forEach(n => { established.delete(n); later.delete(n); });
    established.forEach(n => later.delete(n));
    const positions = new Map<string, string>();
    const visibleJudgments = new Set<string>();
    const contractions = new Map<string, StoryContraction>(c.contractions.map(r => [JSON.stringify(r), r]));
    for (const step of steps.slice(0, i + 1)) {
        for (const p of step.actors) {
            const node = c.stories.find(s => s.id === p.at.story)?.occurrences.find(o => o.id === p.at.occurrence)?.node;
            if (node)
                positions.set(p.actor, node);
        }
        step.introduces.forEach(id => visibleJudgments.add(id));
        step.contractions.forEach(r => contractions.set(JSON.stringify(r), r));
    }
    return { current, established, later, premise: [...new Set(premise)], gapHere, limit: !!opts.limit,
        actors: [...positions].flatMap(([id, node]) => { const actor = c.actors.find(a => a.id === id); return actor ? [{ actor, node }] : []; }),
        visibleJudgments, activeContractions: [...contractions.values()],
        reasons: ["Bold outlines mark claims first told in this step. Solid outlines mark earlier claims; dashed outlines mark later claims. Other boxes are outside this story.", "Positions carry forward until the author places the actor again. A shared actor icon asserts that the steps concern the same actor.", "Default order follows the captured prerequisites, grouping an act with its available inputs and resulting conditions. It is a suggested telling, not a timestamp inferred from evidence."],
    };
}
