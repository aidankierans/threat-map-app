import type { GraphIndex } from "../types.js";
import { edgeId } from "../edge-id.js";
import type { Actor, AnalysisDocument, AnalysisStory, Presentation, PresentationStep } from "./reader-state.js";
import { DEFAULT_ROUTE } from "./router.js";
import { subjectsOf, traceStories, type Story, type StoryMode, type StoryStep } from "./story.js";
import type { Graph } from "./selectors.js";
import { deployments, orderedActs } from "./story-order.js";
import { resolveRequirement } from "./case-codec.js";
export function captureStory(graph: Graph, _index: GraphIndex, story: Story): AnalysisStory {
    const sid = `story-${story.destination}`;
    const local = (id: string) => `claim-${id}`;
    return { id: sid, title: graph.byId.get(story.destination)?.label ?? story.destination,
        destinationOccurrence: local(story.destination), waypointOccurrences: story.waypoints.map(local),
        occurrences: story.steps.map(s => {
            const group = graph.index.gates[s.id]?.[s.group];
            return { id: local(s.id), node: s.id, scope: `scope-${sid}`,
                argument: s.group < 0 ? { kind: "premise" as const } : { kind: "requirement" as const,
                    ref: { target: s.id, all: [...(group?.all ?? s.because.map(l => l.declared ?? l.from))].sort(), partial: s.incomplete, note: group?.note ?? "" },
                    members: s.because.map(l => ({ declared: l.declared ?? l.from, occurrence: local(l.from) })),
                },
            };
        }),
    };
}
export function defaultActors(index: GraphIndex, story: Story): Actor[] {
    const actors = new Map<string, Actor>([["agent", { id: "agent", label: "Acting agent", kind: "ai" }]]);
    for (const s of story.steps)
        for (const subject of subjectsOf(index, story, s.id)) {
            actors.set(subject.component, { id: subject.component, label: subject.label,
                kind: ["human", "person"].includes(subject.role) ? "human" : subject.role === "population" ? "population" : "ai" });
        }
    for (const s of story.steps) {
        const node = index.nodes.find(n => n.id === s.id);
        const band = index.groups.find(g => g.id === node?.group);
        if (band?.subject?.includes("population"))
            actors.set(`population-${band.id}`, { id: `population-${band.id}`, label: "Agent population", kind: "population" });
    }
    return [...actors.values()];
}
export function defaultPresentation(graph: Graph, story: Story, captured: AnalysisStory): Presentation {
    const steps: PresentationStep[] = [];
    const placed = new Set<string>();
    const ref = (id: string) => ({ story: captured.id, occurrence: captured.occurrences.find(o => o.node === id)!.id });
    const add = (title: string, nodes: string[]) => {
        const fresh = [...new Set(nodes)].filter(id => !placed.has(id));
        if (!fresh.length)
            return;
        fresh.forEach(id => placed.add(id));
        const act = fresh.find(id => story.byId.get(id)?.layer === "failure-mode");
        const position = act ?? fresh.find(id => story.byId.get(id)?.layer === "stage") ?? fresh[fresh.length - 1];
        steps.push({ id: `${captured.id}-step-${steps.length + 1}`, kind: "moment", title, caption: "", occurrences: fresh.map(ref),
            actors: [{ actor: "agent", at: ref(position) }, ...defaultActors(graph.index, story).filter(a => a.id !== "agent" && fresh.some(id => subjectsOf(graph.index, story, id).some(s => s.component === a.id) || (a.kind === "population" && graph.byId.get(id)?.group === a.id.slice(11)))).map(a => ({ actor: a.id, at: ref(position) }))],
            introduces: [], contractions: [], origin: "derived" });
    };
    add("Starting situation", [...deployments(story).flatMap(d => [d.stage, ...d.components]), ...story.premises]);
    const pending = (id: string, seen = new Set<string>()): string[] => {
        if (placed.has(id) || seen.has(id))
            return [];
        seen.add(id);
        const s = story.byId.get(id)!;
        return [...s.because.flatMap(l => pending(l.from, seen)), id];
    };
    for (const act of orderedActs(story)) {
        const needed = pending(act.id);
        for (const id of needed.filter(id => story.byId.get(id)?.incomplete)) {
            const before = pending(id).filter(n => n !== id);
            add("Required access and conditions", before);
            add(`Assumption: ${graph.byId.get(id)?.label ?? id}`, [id]);
        }
        const results = story.steps.filter(s => s.layer === "condition" && !s.incomplete && s.id !== story.destination && s.because.some(l => l.from === act.id) && s.because.every(l => placed.has(l.from) || needed.includes(l.from))).map(s => s.id);
        add(graph.byId.get(act.id)?.label ?? act.id, [...pending(act.id), ...results]);
    }
    for (const s of story.steps)
        if (s.incomplete && !placed.has(s.id)) {
            add("Required access and conditions", pending(s.id).filter(id => id !== s.id));
            add(`Assumption: ${graph.byId.get(s.id)?.label ?? s.id}`, [s.id]);
        }
    add(`Outcome: ${graph.byId.get(story.destination)?.label ?? story.destination}`, [...pending(story.destination), ...story.steps.map(s => s.id).filter(id => !placed.has(id))]);
    return { steps };
}
export function deriveCaseStudy(graph: Graph, index: GraphIndex, selection: string[], mode: StoryMode): AnalysisDocument {
    const result = traceStories(graph, selection, mode);
    if (!result.stories.length || result.problems.length)
        throw new Error(result.problems.join(" ") || "Select a premise and an outcome to make a case study.");
    const stories = result.stories.map(s => captureStory(graph, index, s));
    const actors = [...new Map(result.stories.flatMap(s => defaultActors(index, s)).map(a => [a.id, a])).values()];
    const title = stories.map(s => s.title).join("; ");
    const closure = new Set<string>();
    const visit = (id: string) => {
        if (closure.has(id))
            return;
        closure.add(id);
        if (["stage", "component"].includes(index.nodes.find(n => n.id === id)?.layer ?? ""))
            return;
        for (const g of index.gates[id] ?? [])
            g.all.forEach(visit);
    };
    result.destinations.forEach(visit);
    const sourceKeys = new Set([...closure].flatMap(id => index.sourceKeys?.[id] ?? []));
    for (const [id, edge] of Object.entries(index.edgeDocs))
        if (closure.has(edge.to))
            (index.sourceKeys?.[id] ?? []).forEach(k => sourceKeys.add(k));
    const basis = index.mapBasis ? { ...index.mapBasis, dependencies: index.mapBasis.dependencies.filter(d => d.key === "rules" || sourceKeys.has(d.key.slice(7)) && d.key.startsWith("source:") || [...closure].some(id => d.key === `node:${id}` || d.key.startsWith(`requirement:["${id}"`) || d.key.includes(id) && d.key.startsWith("edge:"))) } : { revision: "unversioned", rulesVersion: 1, dependencies: [] };
    return { kind: "threat-map/analysis", schemaVersion: 1, identity: { analysisId: crypto.randomUUID(), revisionId: crypto.randomUUID() }, createdAt: new Date().toISOString(),
        map: basis,
        content: { title, premise: "", interpretation: "", actors,
            context: { title: "Deployment premise", description: "", scopes: stories.map(s => ({ id: `scope-${s.id}`, actor: "agent", system: "Posited deployment", moment: "Story" })), facts: [], mappings: [] },
            view: { ...DEFAULT_ROUTE, selection, filters: { ...DEFAULT_ROUTE.filters, fold: { all: false, except: [] } } },
            request: { waypoints: [...new Set(result.stories.flatMap(s => s.waypoints))], destinations: result.destinations, mode },
            stories, archivedStories: [], judgments: [], contractions: [],
            presentation: { steps: result.stories.flatMap((s, i) => defaultPresentation(graph, s, stories[i]).steps) },
        },
    };
}
export function capturedStory(graph: Graph, captured: AnalysisStory): Story {
    const nodes = new Map(captured.occurrences.map(o => [o.id, o.node]));
    const steps: StoryStep[] = captured.occurrences.map(o => {
        const a = o.argument;
        const resolved = a.kind === "requirement" ? resolveRequirement(graph.index, a.ref) : null;
        return { id: o.node, layer: graph.byId.get(o.node)?.layer ?? "condition", column: graph.columnOf.get(graph.byId.get(o.node)?.layer ?? "condition") ?? -1,
            group: resolved?.status === "resolved" ? resolved.group : -1, incomplete: a.kind === "requirement" && a.ref.partial,
            because: a.kind === "premise" ? [] : a.members.map(m => { const from = nodes.get(m.occurrence)!; return { from, ...(from !== m.declared ? { declared: m.declared } : {}), edge: edgeId(m.declared, o.node), documented: edgeId(m.declared, o.node) in graph.index.edgeDocs }; }),
            picked: captured.waypointOccurrences.includes(o.id) || captured.destinationOccurrence === o.id, cost: 0 };
    });
    return { destination: nodes.get(captured.destinationOccurrence)!, waypoints: captured.waypointOccurrences.map(id => nodes.get(id)!), steps, byId: new Map(steps.map(s => [s.id, s])), nodes: new Set(steps.map(s => s.id)),
        edges: new Set(steps.flatMap(s => s.because.map(l => l.edge!))), premises: captured.occurrences.filter(o => o.argument.kind === "premise").map(o => o.node), gaps: steps.filter(s => s.incomplete).map(s => s.id), cost: 0 };
}
