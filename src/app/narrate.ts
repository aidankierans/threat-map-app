import { orderedActs as storyActs, deployments as storyDeployments } from "./story-order.js";
import type { GraphIndex, IndexNode } from "../types.js";
import type { Graph } from "./selectors.js";
import { statusLabel } from "./selectors.js";
import { bandSubjectOf, subjectTrail, subjectsOf, type Story, type StoryStep, } from "./story.js";
export interface StoryParagraph {
    about?: string[];
    heading?: string;
    text: string;
}
export interface Narration {
    title: string;
    paragraphs: StoryParagraph[];
}
function cite(label: string, id: string): string {
    return `${label} (${id})`;
}
function lower(label: string): string {
    const first = label.split(/\s/, 1)[0] ?? "";
    if (/[A-Z0-9]/.test(first.slice(1)))
        return label;
    return label.charAt(0).toLowerCase() + label.slice(1);
}
function stop(text: string): string {
    const trimmed = text.trim();
    if (!trimmed)
        return "";
    return /[.!?:;]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
function list(items: readonly string[]): string {
    if (items.length <= 1)
        return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
const WORDS = [
    "no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
];
function word(n: number): string {
    return WORDS[n] ?? String(n);
}
function count(n: number, singular: string, plural = `${singular}s`): string {
    return `${word(n)} ${n === 1 ? singular : plural}`;
}
function para(...sentences: Array<string | number | undefined | false>): string {
    return sentences
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((text) => stop(text).replace(/^[a-z]/, (c) => c.toUpperCase()))
        .join(" ");
}
interface Told {
    g: Graph;
    index: GraphIndex;
    story: Story;
    node: (id: string) => IndexNode | undefined;
    named: (id: string) => string;
    ref: (id: string) => string;
    bandOf: (id: string) => {
        id: string;
        label: string;
        subject?: string;
    } | undefined;
}
function reader(g: Graph, story: Story): Told {
    const offCanvas = new Map(g.index.nodes.map((n) => [n.id, n]));
    const node = (id: string) => g.byId.get(id) ?? offCanvas.get(id);
    const named = (id: string) => node(id)?.label ?? id;
    return {
        g,
        index: g.index,
        story,
        node,
        named,
        ref: (id: string) => cite(lower(named(id)), id),
        bandOf: (id: string) => {
            const n = node(id);
            if (!n?.group)
                return undefined;
            const band = g.index.groups.find((b) => b.id === n.group);
            return band && { id: band.id, label: band.short ?? band.label, subject: band.subject };
        },
    };
}
const layerOf = (t: Told, layer: string) => t.story.steps.filter((s) => s.layer === layer);
function conjuncts(t: Told, step: StoryStep, layer: string): StoryStep[] {
    return step.because
        .map((link) => t.story.byId.get(link.from))
        .filter((s): s is StoryStep => !!s && s.layer === layer);
}
function joinNote(t: Told, step: StoryStep, from: string): string | undefined {
    const link = step.because.find((l) => l.from === from);
    if (!link?.edge)
        return undefined;
    return t.index.edgeDocs[link.edge]?.label;
}
function assumedRest(t: Told, step: StoryStep): string | undefined {
    if (step.group < 0)
        return undefined;
    const group = t.index.gates[step.id]?.[step.group];
    if (!group)
        return undefined;
    const present = new Set(step.because.flatMap((l) => (l.declared ? [l.from, l.declared] : [l.from])));
    const rest = group.all.filter((id) => !present.has(id) && t.node(id)?.layer !== "component");
    if (!rest.length)
        return undefined;
    return `The group it stands on also names ${list(rest.map((id) => t.ref(id)))}, which this view assumes rather than draws`;
}
function openPort(t: Told, step: StoryStep): {
    note: string;
} | undefined {
    if (!step.incomplete)
        return undefined;
    const group = t.index.gates[step.id]?.[step.group];
    if (!group?.partial)
        return undefined;
    return { note: group.note ?? "" };
}
function unclosed(t: Told, step: StoryStep): string | undefined {
    if (!openPort(t, step))
        return undefined;
    return `That step is where the map's scope runs out: its gate lists what is in scope and declares it knowingly short of sufficient, so the rung is stated here rather than derived`;
}
function entailment(t: Told, step: StoryStep): string | undefined {
    const stood = step.because.filter((l) => l.declared);
    if (!stood.length)
        return undefined;
    return `The gate asks for ${list(stood.map((l) => t.ref(l.declared!)))}, and a world at ${list(stood.map((l) => t.ref(l.from)))} is already one of those.`;
}
function clauses(items: readonly string[]): string {
    if (items.length <= 1)
        return items[0] ?? "";
    return `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}
function producers(t: Told): Map<string, string> {
    const by = new Map<string, string>();
    for (const step of t.story.steps) {
        if (step.layer !== "condition")
            continue;
        const act = step.because.find((l) => t.story.byId.get(l.from)?.layer === "failure-mode");
        if (act)
            by.set(step.id, act.from);
    }
    return by;
}
function orderedActs(t: Told): StoryStep[] { return storyActs(t.story); }
interface Deployment {
    stage: string;
    components: string[];
    picked: boolean;
}
function deployments(t: Told): Deployment[] { return storyDeployments(t.story); }
function premiseSubstrate(t: Told): Set<string> {
    const named = new Set<string>();
    for (const d of deployments(t))
        for (const c of d.components)
            named.add(c);
    return named;
}
function premise(t: Told): StoryParagraph[] {
    const posited = deployments(t);
    const clause = (d: Deployment) => d.components.length
        ? `${t.ref(d.stage)}, over ${list(d.components.map((c) => t.ref(c)))}`
        : t.ref(d.stage);
    const [first, ...rest] = posited;
    const chose = posited.filter((d) => d.picked);
    return [
        {
            heading: "The premise",
            about: t.story.premises,
            text: para(first
                ? `Suppose an agent is put to work at ${clause(first)}`
                : "Suppose an agent is at work somewhere this view no longer draws", rest.length && `Suppose it is also at ${rest.map(clause).join("; and at ")}`, posited.length > 1
                ? "Each of those is a supposition about where an agent is deployed, and this map makes it rather than reporting it — an affordance is not evidence that anybody granted it"
                : "That is a supposition about where an agent is deployed, and this map makes it rather than reporting it — an affordance is not evidence that anybody granted it", posited.length > 1 &&
                `${count(posited.length, "separate deployment")}, then, and the story needs all of them at once`, chose.length > 0 &&
                chose.length < posited.length &&
                `Only ${list(chose.map((d) => t.ref(d.stage)))} ${chose.length === 1 ? "was" : "were"} picked; the rest are suppositions the walk had to add to close the argument`, !premiseSubstrate(t).size &&
                !layerOf(t, "component").length &&
                "The stack it runs over is assumed rather than drawn, because this view has taken those boxes off the canvas while leaving what they carry standing", t.story.gaps.length > 0 &&
                `This story also has a declared gap in it: ${count(t.story.gaps.length, "step")} of it stands on a gate the map marks knowingly incomplete, so the chain argues to the edge of what the map models and then states what lies past that edge rather than deriving it`),
        },
    ];
}
function standing(t: Told): StoryParagraph[] {
    const by = producers(t);
    const steps = layerOf(t, "condition").filter((s) => !by.has(s.id));
    if (!steps.length)
        return [];
    return steps.map((step, i) => {
        const from = [...conjuncts(t, step, "stage"), ...conjuncts(t, step, "condition")];
        const band = t.bandOf(step.id);
        return {
            heading: i === 0 ? "What already holds" : undefined,
            about: [step.id],
            text: para(i === 0 &&
                `${count(steps.length, "thing")} ${steps.length === 1 ? "is" : "are"} true of the world before the agent does anything, because the deployment is enough for ${steps.length === 1 ? "it" : "them"}`, from.length
                ? `${i === 0 ? "" : "And alongside it: "}${t.ref(step.id)}, established by ${list(from.map((s) => t.ref(s.id)))}`
                : `${i === 0 ? "" : "And alongside it: "}the world already stands at ${t.ref(step.id)}`, t.node(step.id)?.lead, from.map((s) => joinNote(t, step, s.id)).find(Boolean), assumedRest(t, step), bandSentence(band), unclosed(t, step), entailment(t, step)),
        };
    });
}
function bandSentence(band: {
    id: string;
    label: string;
    subject?: string;
} | undefined): string | undefined {
    if (!band?.subject)
        return undefined;
    return `That is one answer to ${cite(lower(band.label), band.id)}, and it is an answer about ${band.subject}`;
}
function affordances(t: Told): StoryParagraph[] {
    const steps = layerOf(t, "affordance");
    if (!steps.length)
        return [];
    return steps.map((step, i) => {
        const from = conjuncts(t, step, "stage");
        const over = conjuncts(t, step, "component");
        const where = from.length
            ? `Deployed at ${list(from.map((s) => t.ref(s.id)))}${over.length ? `, over ${list(over.map((s) => t.ref(s.id)))}` : ""}, the agent holds ${t.ref(step.id)}`
            : `The deployment puts ${t.ref(step.id)} in its hands${over.length ? `, over ${list(over.map((s) => t.ref(s.id)))}` : ""}`;
        return {
            heading: i === 0 ? "What that puts in reach" : undefined,
            about: [step.id],
            text: para(where, t.node(step.id)?.lead, [...from, ...over].map((s) => joinNote(t, step, s.id)).find(Boolean), assumedRest(t, step), unclosed(t, step)),
        };
    });
}
function acts(t: Told): StoryParagraph[] {
    const steps = orderedActs(t);
    if (!steps.length)
        return [];
    const by = producers(t);
    const alreadyNamed = premiseSubstrate(t);
    return steps.map((step, i) => {
        const held = conjuncts(t, step, "affordance");
        const takes = conjuncts(t, step, "condition");
        const band = t.bandOf(step.id);
        const aimed = subjectsOf(t.index, t.story, step.id);
        const parties = new Set(aimed.map((s) => s.component));
        const over = conjuncts(t, step, "component").filter((s) => !alreadyNamed.has(s.id) && !parties.has(s.id));
        const opening = held.length
            ? `Holding ${list(held.map((s) => t.ref(s.id)))}, the agent has what it takes for ${t.ref(step.id)}`
            : `That is all it takes for ${t.ref(step.id)}`;
        const terms = takes.map((s) => {
            const producer = by.get(s.id);
            return producer && producer !== step.id
                ? `${t.ref(s.id)}, which ${t.ref(producer)} brings about`
                : `${t.ref(s.id)}, which already holds`;
        });
        return {
            heading: i === 0 ? "What the agent can then do" : undefined,
            about: [step.id],
            text: para(opening, t.node(step.id)?.lead, held.map((s) => joinNote(t, step, s.id)).find(Boolean), over.length > 0 && `The act runs over ${list(over.map((s) => t.ref(s.id)))} as well`, terms.length > 0 &&
                `The act is not free-standing. It also rests on ${count(terms.length, "state")} of the world: ${clauses(terms)}`, assumedRest(t, step), band && `The map classes the act as ${cite(lower(band.label), band.id)}`, unclosed(t, step), aimed.length > 0 &&
                `What it is aimed at is ${list(aimed.map((s) => t.ref(s.component)))} — which is what makes this a step between parties rather than a step over infrastructure`),
        };
    });
}
function results(t: Told): StoryParagraph[] {
    const by = producers(t);
    const rank = new Map(orderedActs(t).map((a, i) => [a.id, i]));
    const steps = layerOf(t, "condition")
        .filter((s) => by.has(s.id))
        .sort((a, b) => (rank.get(by.get(a.id)!) ?? 0) - (rank.get(by.get(b.id)!) ?? 0));
    if (!steps.length)
        return [];
    return steps.map((step, i) => {
        const brought = conjuncts(t, step, "failure-mode");
        const band = t.bandOf(step.id);
        return {
            heading: i === 0 ? "Where that leaves the world" : undefined,
            about: [step.id],
            text: para(i === 0
                ? `What that leaves behind is a state of the world rather than a new power: ${t.ref(step.id)}, brought about by ${list(brought.map((s) => t.ref(s.id)))}`
                : `And alongside it: ${t.ref(step.id)}, brought about by ${list(brought.map((s) => t.ref(s.id)))}`, t.node(step.id)?.lead, brought.map((s) => joinNote(t, step, s.id)).find(Boolean), assumedRest(t, step), bandSentence(band), unclosed(t, step), entailment(t, step)),
        };
    });
}
function outcome(t: Told): StoryParagraph[] {
    const step = t.story.byId.get(t.story.destination);
    if (!step)
        return [];
    const node = t.node(step.id);
    const band = t.bandOf(step.id);
    const held = step.because.map((l) => t.ref(l.from));
    const heading = step.layer === "event" ? "What it amounts to" : `Where the story ends: ${step.id}`;
    return [
        {
            heading,
            about: [step.id],
            text: para(held.length
                ? `That is what it adds up to: ${cite(lower(t.named(step.id)), step.id)}`
                : `The story ends at ${t.ref(step.id)}`, node?.lead, held.length > 1
                ? `It takes ${count(held.length, "thing")}, and takes them together: ${clauses(held)}`
                : held.length === 1 && `It takes one thing: ${held[0]}`, assumedRest(t, step), held.length > 1 &&
                "That is one sufficient set — any other group of its gate would be a different route to the same cost", band &&
                (step.layer === "event"
                    ? `The map bands it ${cite(lower(band.label), band.id)}`
                    : `It sits in ${cite(lower(band.label), band.id)}`), unclosed(t, step), t.story.gaps.length > 0 &&
                `Not all of that is derived: ${list(t.story.gaps.map((id) => t.ref(id)))} ${t.story.gaps.length === 1 ? "is" : "are"} reached only through a gate the map declares knowingly incomplete, which the section below sets out`, entailment(t, step)),
        },
    ];
}
function gaps(t: Told): StoryParagraph[] {
    const steps = t.story.steps.filter((step) => step.incomplete);
    if (!steps.length)
        return [];
    return steps.map((step, i) => {
        const port = openPort(t, step);
        const listed = step.because.map((link) => t.ref(link.from));
        return {
            heading: i === 0 ? "What this story does not derive" : undefined,
            about: [step.id],
            text: para(`The chain reaches ${t.ref(step.id)} through a group of its gate that the map marks incomplete on purpose`, listed.length &&
                `What that group lists — ${list(listed)} — is necessary, and the group declares in the same breath that it is not the whole of what the step takes`, port?.note, "So the port stays open, and it is not the kind of open port a filter leaves: no further content closes it, because what would close it is not the sort of thing this map carries", "What the story can be read for is the rest of it — the part that is in scope, argued to the boundary, with the shape of the missing piece named rather than glossed"),
        };
    });
}
function subjects(t: Told): StoryParagraph[] {
    const trail = subjectTrail(t.index, t.story);
    if (!trail.length)
        return [];
    const gloss = (role: string) => t.index.taxonomies.subject?.values[role]?.short ?? role;
    const rows = trail.map((row) => {
        const first = row.steps[0]!;
        return `${cite(lower(row.label), row.component)} — ${gloss(row.role)} — which ${count(row.steps.length, "step")} of this story act${row.steps.length === 1 ? "s" : ""} on, first at ${t.ref(first)}`;
    });
    return [
        {
            heading: "Who this is about",
            about: [t.story.destination],
            text: para("The agent posited in the premise is the actor at every step — that is what this map is a map of", `What changes along the way is what it is acting on: ${list(rows)}`, trail.some((r) => r.role === "population") &&
                "A population is not a larger version of a single model. A step that reaches one is a claim about an aggregate, and an aggregate is exactly what a task-level record does not distinguish from ordinary work", trail.some((r) => r.role === "model") &&
                "Where a step's object is another model, the story has changed hands: what follows is no longer only about what the first agent can do", trail.some((r) => r.role === "person") &&
                "Where a step's object is a person or a body, the gate the story passes through is a human one — which is not the same as a safe one"),
        },
    ];
}
function evidence(t: Told, showCitationNeeds: boolean): StoryParagraph[] {
    const nodes = t.story.steps
        .map((s) => t.node(s.id))
        .filter((n): n is IndexNode => !!n);
    const byStatus = new Map<string, number>();
    for (const n of nodes)
        byStatus.set(n.status, (byStatus.get(n.status) ?? 0) + 1);
    const uncited = nodes.filter((n) => n.needsCitation).length;
    const joins = t.story.steps.flatMap((s) => s.because);
    const documented = joins.filter((l) => l.documented).length;
    const order = t.index.taxonomies.status?.order ?? [...byStatus.keys()];
    const present = order.filter((s) => byStatus.get(s));
    const tally = present.length === 1
        ? `${count(nodes.length, "node")} carry this story, all of them ${present[0]}`
        : `${count(nodes.length, "node")} carry this story: ${list(present.map((s) => `${word(byStatus.get(s)!)} ${s}`))}`;
    const written = !joins.length
        ? undefined
        : documented === 0
            ? `None of ${count(joins.length, "join")} between them has its argument written up in content/edges/ — each is asserted by the two nodes it runs between and nowhere else`
            : documented === joins.length
                ? `All ${count(joins.length, "join")} between them have their arguments written up in content/edges/`
                : `Of ${count(joins.length, "join")} between them, ${word(documented)} ${documented === 1 ? "has its argument" : "have their arguments"} written up in content/edges/; the rest are asserted by the two nodes they run between and nowhere else`;
    return [
        {
            heading: "Where the evidence stands",
            about: [t.story.destination],
            text: para(tally, showCitationNeeds && uncited > 0 &&
                `${count(uncited, "of them still needs a citation", "of them still need a citation")}`, written, t.story.gaps.length === 0
                ? "That the walk closes says the gates are satisfied. It does not say the claims are right"
                : "This walk does not close, and the gate it stops at says so itself. That the in-scope part of it closes says those gates are satisfied. It does not say the claims are right, and it says nothing at all about what lies past the boundary"),
        },
    ];
}
export function narrate(g: Graph, story: Story, options: {
    showCitationNeeds?: boolean;
    includeGapExplanations?: boolean;
} = {}): Narration {
    const t = reader(g, story);
    const end = t.named(story.destination);
    const through = story.waypoints.length
        ? `, through ${clauses(story.waypoints.map((id) => t.named(id)))}`
        : "";
    return {
        title: `${end}${through}`,
        paragraphs: [
            ...premise(t),
            ...standing(t),
            ...affordances(t),
            ...acts(t),
            ...results(t),
            ...outcome(t),
            ...(options.includeGapExplanations === false ? [] : gaps(t)),
            ...subjects(t),
            ...evidence(t, options.showCitationNeeds ?? true),
        ],
    };
}
export function asMarkdown(n: Narration): string {
    const out: string[] = [`# ${n.title}`, ""];
    for (const p of n.paragraphs) {
        if (p.heading)
            out.push(`## ${p.heading}`, "");
        out.push(p.text, "");
    }
    return out.join("\n").trimEnd() + "\n";
}
export interface StoryChecks {
    crowded: Array<{
        column: number;
        layer: string;
        count: number;
    }>;
    ladders: Array<{
        band: string;
        label: string;
        members: string[];
    }>;
    subjects: string[];
    wideGroups: Array<{
        node: string;
        group: number;
        subjects: string[];
        noted: boolean;
    }>;
}
export const MANY_SUBJECTS = 3;
export function storyChecks(g: Graph, story: Story): StoryChecks {
    const perLayer = new Map<string, StoryStep[]>();
    for (const step of story.steps) {
        if (step.column < 0)
            continue;
        const held = perLayer.get(step.layer) ?? [];
        held.push(step);
        perLayer.set(step.layer, held);
    }
    const crowded = [...perLayer.entries()]
        .filter(([, steps]) => steps.length > 4)
        .map(([layer, steps]) => ({ column: steps[0]!.column, layer, count: steps.length }))
        .sort((a, b) => a.column - b.column);
    const perBand = new Map<string, string[]>();
    for (const step of story.steps) {
        const node = g.byId.get(step.id);
        if (!node?.group)
            continue;
        const band = g.index.groups.find((b) => b.id === node.group);
        if (band?.kind !== "partition")
            continue;
        perBand.set(band.id, [...(perBand.get(band.id) ?? []), step.id]);
    }
    const ladders = [...perBand.entries()]
        .filter(([, members]) => members.length > 1)
        .map(([band, members]) => ({
        band,
        label: g.index.groups.find((b) => b.id === band)?.label ?? band,
        members,
    }));
    const subjectOf = (id: string) => {
        const node = g.byId.get(id);
        return node && bandSubjectOf(g.index, node);
    };
    const subjects = [
        ...new Set(story.steps.map((step) => subjectOf(step.id)).filter((s): s is string => !!s)),
    ];
    const wideGroups: StoryChecks["wideGroups"] = [];
    for (const step of story.steps) {
        if (step.group < 0)
            continue;
        const group = g.index.gates[step.id]?.[step.group];
        if (!group)
            continue;
        const held = [...new Set(group.all.map(subjectOf).filter((s): s is string => !!s))];
        if (held.length < MANY_SUBJECTS)
            continue;
        wideGroups.push({
            node: step.id,
            group: step.group,
            subjects: held,
            noted: !!group.note,
        });
    }
    return { crowded, ladders, subjects, wideGroups };
}
export function storyStatus(g: Graph, story: Story): string {
    const nodes = story.steps.map((s) => g.byId.get(s.id)).filter((n): n is IndexNode => !!n);
    const worst = nodes.find((n) => n.status === "draft") ?? nodes[0];
    return worst ? statusLabel(worst) : "";
}
