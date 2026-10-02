import type { GraphIndex, IndexNode, LayerName } from "../types.js";
import { edgeId } from "../edge-id.js";
import { scaleSatisfiers } from "../scale.js";
import { SEED_LAYERS, endpointsOf, type Graph } from "./selectors.js";
export type StoryMode = "all" | "any";
export const MAX_WAYPOINTS = 8;
export const MAX_STORIES = 12;
const STEP = 10;
const PREMISE = 25;
const SUBSTRATE = 0;
const DOCUMENTED = 3;
export const GAP = 100000;
const INF = Infinity;
export interface StoryLink {
    from: string;
    declared?: string;
    edge?: string;
    documented: boolean;
}
export interface StoryStep {
    id: string;
    layer: LayerName;
    column: number;
    group: number;
    because: StoryLink[];
    incomplete: boolean;
    picked: boolean;
    cost: number;
}
export interface Story {
    destination: string;
    waypoints: string[];
    steps: StoryStep[];
    byId: Map<string, StoryStep>;
    nodes: Set<string>;
    edges: Set<string>;
    premises: string[];
    gaps: string[];
    cost: number;
}
export interface StoryResult {
    mode: StoryMode;
    modeMatters: boolean;
    stories: Story[];
    nodes: Set<string>;
    edges: Set<string>;
    picked: Set<string>;
    destinations: string[];
    problems: string[];
}
export interface Ends {
    destinations: string[];
    waypoints: string[];
    dropped: string[];
}
export function storyEnds(g: Graph, selection: readonly string[]): Ends {
    const ids: string[] = [];
    for (const picked of selection) {
        for (const id of endpointsOf(g, picked)) {
            if (g.byId.has(id) && !ids.includes(id))
                ids.push(id);
        }
    }
    if (!ids.length)
        return { destinations: [], waypoints: [], dropped: [] };
    const columnOf = (id: string) => g.columnOf.get(g.byId.get(id)!.layer) ?? -1;
    const last = Math.max(...ids.map(columnOf));
    const destinations = ids.filter((id) => columnOf(id) === last);
    const rest = ids
        .filter((id) => columnOf(id) !== last)
        .sort((a, b) => columnOf(a) - columnOf(b) || a.localeCompare(b));
    return {
        destinations,
        waypoints: rest.slice(0, MAX_WAYPOINTS),
        dropped: rest.slice(MAX_WAYPOINTS),
    };
}
export interface TraceOptions {
    assumed?: ReadonlySet<string>;
    allow?: (id: string) => boolean;
}
interface Solved {
    cost: Map<string, Float64Array>;
    size: number;
    bitOf: Map<string, number>;
    seed: Set<string>;
    assumed: ReadonlySet<string>;
    satisfy: (member: string) => readonly string[];
    index: GraphIndex;
    allowGaps: boolean;
}
function fresh(size: number): Float64Array {
    const a = new Float64Array(size);
    a.fill(INF);
    return a;
}
function closeOverSupersets(a: Float64Array, size: number, k: number): void {
    for (let i = 0; i < k; i++) {
        const bit = 1 << i;
        for (let m = 0; m < size; m++) {
            if (m & bit)
                continue;
            const better = a[m | bit]!;
            if (better < a[m]!)
                a[m] = better;
        }
    }
}
function solve(g: Graph, waypoints: readonly string[], options: TraceOptions, allowGaps: boolean): Solved {
    const index = g.index;
    const assumed = options.assumed ?? new Set<string>();
    const allow = options.allow ?? ((id: string) => g.drawn.has(id));
    const satisfy = scaleSatisfiers(index.groups);
    const k = waypoints.length;
    const size = 1 << k;
    const bitOf = new Map(waypoints.map((id, i) => [id, 1 << i]));
    const cost = new Map<string, Float64Array>();
    const seed = new Set<string>();
    const store = (id: string, raw: Float64Array): boolean => {
        const bit = bitOf.get(id);
        let next = raw;
        if (bit !== undefined) {
            next = fresh(size);
            for (let m = 0; m < size; m++)
                next[m] = raw[m & ~bit]!;
        }
        closeOverSupersets(next, size, k);
        const prior = cost.get(id);
        if (!prior) {
            cost.set(id, next);
            return next.some((v) => v < INF);
        }
        let changed = false;
        for (let m = 0; m < size; m++) {
            if (next[m]! < prior[m]!) {
                prior[m] = next[m]!;
                changed = true;
            }
        }
        return changed;
    };
    for (const n of index.nodes) {
        const isAssumed = assumed.has(n.id);
        const isSeed = SEED_LAYERS.includes(n.layer) && g.drawn.has(n.id) && allow(n.id);
        if (!isAssumed && !isSeed)
            continue;
        const raw = fresh(size);
        raw[0] = isAssumed ? 0 : n.layer === "component" ? SUBSTRATE : PREMISE;
        seed.add(n.id);
        store(n.id, raw);
    }
    const solved: Solved = { cost, size, bitOf, seed, assumed, satisfy, index, allowGaps };
    for (let sweep = 0, changed = true; changed && sweep <= index.nodes.length; sweep++) {
        changed = false;
        for (const n of index.nodes) {
            if (seed.has(n.id) || !allow(n.id) || !g.drawn.has(n.id))
                continue;
            const gate = index.gates[n.id];
            if (!gate?.length)
                continue;
            const raw = fresh(size);
            for (const group of gate) {
                if (group.partial && !allowGaps)
                    continue;
                const acc = combine(solved, group.all, n.id);
                if (!acc)
                    continue;
                for (let m = 0; m < size; m++) {
                    if (acc[m] === INF)
                        continue;
                    const v = acc[m]! + STEP + (group.partial ? GAP : 0);
                    if (v < raw[m]!)
                        raw[m] = v;
                }
            }
            if (store(n.id, raw))
                changed = true;
        }
    }
    return solved;
}
function pick(s: Solved, member: string, gated: string): {
    id: string;
    cost: Float64Array;
    link: StoryLink;
} | null {
    const documented = edgeId(member, gated) in s.index.edgeDocs;
    const edge = edgeId(member, gated);
    const declared = s.cost.get(member);
    const usable = (c: Float64Array | undefined) => c && c.some((v) => v < INF);
    if (usable(declared)) {
        return { id: member, cost: declared!, link: { from: member, edge, documented } };
    }
    let best: {
        id: string;
        cost: Float64Array;
    } | null = null;
    for (const rung of s.satisfy(member)) {
        if (rung === member)
            continue;
        const c = s.cost.get(rung);
        if (!usable(c))
            continue;
        if (!best || c![0]! < best.cost[0]!)
            best = { id: rung, cost: c! };
    }
    if (!best)
        return null;
    return {
        id: best.id,
        cost: best.cost,
        link: { from: best.id, declared: member, documented },
    };
}
function linked(value: number, documented: boolean): number {
    if (value === INF)
        return INF;
    return documented ? Math.max(0, value - DOCUMENTED) : value;
}
function combine(s: Solved, members: readonly string[], gated: string): Float64Array | null {
    if (!members.length)
        return null;
    let acc = fresh(s.size);
    acc[0] = 0;
    for (const member of members) {
        const chosen = pick(s, member, gated);
        if (!chosen)
            return null;
        const next = fresh(s.size);
        for (let a = 0; a < s.size; a++) {
            const base = acc[a]!;
            if (base === INF)
                continue;
            for (let b = 0; b < s.size; b++) {
                const add = linked(chosen.cost[b]!, chosen.link.documented);
                if (add === INF)
                    continue;
                const total = base + add;
                const u = a | b;
                if (total < next[u]!)
                    next[u] = total;
            }
        }
        acc = next;
    }
    return acc;
}
function split(s: Solved, members: readonly string[], gated: string, wanted: number): {
    cost: number;
    picks: Array<{
        id: string;
        mask: number;
        link: StoryLink;
    }>;
} | null {
    const chosen = members.map((m) => pick(s, m, gated));
    if (chosen.some((c) => !c))
        return null;
    const parts = chosen as Array<NonNullable<ReturnType<typeof pick>>>;
    const dp: Float64Array[] = [fresh(s.size)];
    dp[0]![0] = 0;
    const fromMask: Int32Array[] = [];
    const ownMask: Int32Array[] = [];
    for (let i = 0; i < parts.length; i++) {
        const next = fresh(s.size);
        const back = new Int32Array(s.size).fill(-1);
        const own = new Int32Array(s.size).fill(-1);
        const prev = dp[i]!;
        for (let a = 0; a < s.size; a++) {
            const base = prev[a]!;
            if (base === INF)
                continue;
            for (let b = 0; b < s.size; b++) {
                const add = linked(parts[i]!.cost[b]!, parts[i]!.link.documented);
                if (add === INF)
                    continue;
                const total = base + add;
                const u = a | b;
                if (total < next[u]!) {
                    next[u] = total;
                    back[u] = a;
                    own[u] = b;
                }
            }
        }
        dp.push(next);
        fromMask.push(back);
        ownMask.push(own);
    }
    const final = dp[parts.length]!;
    let end = -1;
    for (let m = 0; m < s.size; m++) {
        if ((m & wanted) !== wanted)
            continue;
        if (final[m] === INF)
            continue;
        if (end < 0 || final[m]! < final[end]!)
            end = m;
    }
    if (end < 0)
        return null;
    const picks: Array<{
        id: string;
        mask: number;
        link: StoryLink;
    }> = [];
    let mask = end;
    for (let i = parts.length - 1; i >= 0; i--) {
        const own = ownMask[i]![mask]!;
        picks.unshift({ id: parts[i]!.id, mask: own, link: parts[i]!.link });
        mask = fromMask[i]![mask]!;
    }
    return { cost: final[end]!, picks };
}
function reconstruct(s: Solved, g: Graph, destination: string, waypoints: readonly string[]): Story | null {
    const wanted = waypoints.reduce((m, id) => m | (s.bitOf.get(id) ?? 0), 0);
    const table = s.cost.get(destination);
    if (!table || table[wanted] === INF)
        return null;
    const byId = new Map<string, StoryStep>();
    const demanded = new Map<string, number>();
    const picked = new Set<string>([destination, ...waypoints]);
    const visit = (id: string, mask: number): void => {
        const bit = s.bitOf.get(id);
        const asked = bit === undefined ? mask : mask & ~bit;
        const before = demanded.get(id);
        if (before !== undefined && (before & asked) === asked)
            return;
        const need = (before ?? 0) | asked;
        demanded.set(id, need);
        if (s.assumed.has(id) && !g.byId.has(id))
            return;
        const node = g.byId.get(id);
        if (!node)
            return;
        const column = g.columnOf.get(node.layer) ?? -1;
        const cost = s.cost.get(id)?.[need] ?? INF;
        if (s.seed.has(id)) {
            byId.set(id, {
                id,
                layer: node.layer,
                column,
                group: -1,
                because: [],
                incomplete: false,
                picked: picked.has(id),
                cost,
            });
            return;
        }
        const gate = s.index.gates[id] ?? [];
        let best: {
            group: number;
            picks: NonNullable<ReturnType<typeof split>>;
        } | null = null;
        for (let gi = 0; gi < gate.length; gi++) {
            const group = gate[gi]!;
            if (group.partial && !s.allowGaps)
                continue;
            const got = split(s, group.all, id, need);
            if (!got)
                continue;
            const priced = got.cost + (group.partial ? GAP : 0);
            if (!best || priced < best.picks.cost + (gate[best.group]!.partial ? GAP : 0)) {
                best = { group: gi, picks: got };
            }
        }
        if (!best)
            return;
        byId.set(id, {
            id,
            layer: node.layer,
            column,
            group: best.group,
            because: best.picks.picks.map((p) => p.link),
            incomplete: !!gate[best.group]!.partial,
            picked: picked.has(id),
            cost,
        });
        for (const p of best.picks.picks)
            visit(p.id, p.mask);
    };
    visit(destination, wanted);
    if (!byId.has(destination))
        return null;
    const load = new Set<string>([destination]);
    for (const stack = [destination]; stack.length;) {
        const step = byId.get(stack.pop()!);
        if (!step)
            continue;
        step.because = step.because.filter((link) => byId.has(link.from));
        for (const link of step.because) {
            if (load.has(link.from))
                continue;
            load.add(link.from);
            stack.push(link.from);
        }
    }
    for (const id of [...byId.keys()])
        if (!load.has(id))
            byId.delete(id);
    if (waypoints.some((id) => !byId.has(id)))
        return null;
    const edges = new Set<string>();
    for (const step of byId.values()) {
        for (const link of step.because) {
            if (link.edge && g.edgeById.has(link.edge))
                edges.add(link.edge);
        }
    }
    const steps = [...byId.values()].sort((a, b) => a.column - b.column || a.cost - b.cost || a.id.localeCompare(b.id));
    return {
        destination,
        waypoints: [...waypoints],
        steps,
        byId,
        nodes: new Set(byId.keys()),
        edges,
        premises: steps.filter((step) => step.group === -1).map((step) => step.id),
        gaps: steps.filter((step) => step.incomplete).map((step) => step.id),
        cost: table[wanted]!,
    };
}
export function traceStories(g: Graph, selection: readonly string[], mode: StoryMode, options: TraceOptions = {}): StoryResult {
    const ends = storyEnds(g, selection);
    const problems: string[] = [];
    const modeMatters = ends.waypoints.length > 1;
    const empty: StoryResult = {
        mode,
        modeMatters,
        stories: [],
        nodes: new Set(),
        edges: new Set(),
        picked: new Set(),
        destinations: [],
        problems,
    };
    if (!ends.destinations.length) {
        problems.push("Select at least one node — a story is argued for whatever is furthest right.");
        return empty;
    }
    if (ends.dropped.length) {
        problems.push(`Threading through more than ${MAX_WAYPOINTS} chosen nodes stops being a story, ` +
            `so ${ends.dropped.join(", ")} ${ends.dropped.length === 1 ? "is" : "are"} not being required.`);
    }
    const label = (id: string) => g.byId.get(id)?.label ?? id;
    const stories: Story[] = [];
    const passes = new Map<boolean, Solved>();
    const tables = (allowGaps: boolean): Solved => {
        let s = passes.get(allowGaps);
        if (!s) {
            s = solve(g, ends.waypoints, options, allowGaps);
            passes.set(allowGaps, s);
        }
        return s;
    };
    const derive = (destination: string, waypoints: readonly string[]): Story | null => reconstruct(tables(false), g, destination, waypoints) ??
        reconstruct(tables(true), g, destination, waypoints);
    if (mode === "all" || ends.waypoints.length === 0) {
        for (const destination of ends.destinations) {
            const story = derive(destination, ends.waypoints);
            if (story)
                stories.push(story);
            else if (ends.waypoints.length) {
                problems.push(`No route reaches ${label(destination)} (${destination}) through all of ` +
                    `${ends.waypoints.map((id) => `${label(id)} (${id})`).join(", ")}. ` +
                    `Try "any", or take one of them out of the selection.`);
            }
            else {
                problems.push(`Nothing on this canvas closes a gate group of ${label(destination)} (${destination}). ` +
                    `Either a conjunct is filtered out, or the map has no route to it.`);
            }
        }
    }
    else {
        let budget = MAX_STORIES;
        let skipped = 0;
        const drawn = new Map<string, Story>();
        const columnOf = (id: string) => g.columnOf.get(g.byId.get(id)!.layer) ?? -1;
        for (const destination of ends.destinations) {
            for (const waypoint of ends.waypoints) {
                if (budget <= 0) {
                    skipped++;
                    continue;
                }
                const story = derive(destination, [waypoint]);
                if (!story) {
                    problems.push(`No route reaches ${label(destination)} (${destination}) through ` +
                        `${label(waypoint)} (${waypoint}).`);
                    continue;
                }
                const shape = `${destination}\u0000${[...story.nodes].sort().join(",")}`;
                const already = drawn.get(shape);
                if (already) {
                    if (!already.waypoints.includes(waypoint)) {
                        already.waypoints.push(waypoint);
                        already.waypoints.sort((a, b) => columnOf(a) - columnOf(b) || a.localeCompare(b));
                        const step = already.byId.get(waypoint);
                        if (step)
                            step.picked = true;
                    }
                    continue;
                }
                drawn.set(shape, story);
                stories.push(story);
                budget--;
            }
        }
        if (skipped) {
            problems.push(`${skipped} further pairings are not drawn — ${MAX_STORIES} stories is the cap.`);
        }
    }
    const nodes = new Set<string>();
    const edges = new Set<string>();
    for (const story of stories) {
        for (const id of story.nodes)
            nodes.add(id);
        for (const id of story.edges)
            edges.add(id);
    }
    return {
        mode,
        modeMatters,
        stories,
        nodes,
        edges,
        picked: new Set([...ends.destinations, ...ends.waypoints]),
        destinations: ends.destinations,
        problems,
    };
}
export type SubjectRole = string;
export interface Subject {
    role: SubjectRole;
    component: string;
    label: string;
}
export function roleOfComponent(index: GraphIndex, id: string): SubjectRole {
    const tax = index.taxonomies.subject;
    if (!tax)
        return "substrate";
    const override = tax.overrides?.[id];
    if (override)
        return override;
    const parents = new Map(index.components.map((c) => [c.id, c.parent]));
    const seen = new Set<string>();
    for (let at: string | undefined = id; at && !seen.has(at); at = parents.get(at)) {
        seen.add(at);
        const named = tax.parties?.[at];
        if (named)
            return named;
    }
    return "substrate";
}
export function subjectsOf(index: GraphIndex, story: Story, id: string): Subject[] {
    const cache = new Map<string, Subject[]>();
    const labelOf = new Map(index.components.map((c) => [c.id, c.label]));
    const walk = (at: string, depth: number): Subject[] => {
        const done = cache.get(at);
        if (done)
            return done;
        if (depth > story.steps.length + 1)
            return [];
        cache.set(at, []);
        const step = story.byId.get(at);
        if (!step)
            return [];
        const out = new Map<string, Subject>();
        const add = (componentId: string) => {
            const role = roleOfComponent(index, componentId);
            if (role === "substrate")
                return;
            out.set(componentId, {
                role,
                component: componentId,
                label: labelOf.get(componentId) ?? componentId,
            });
        };
        for (const link of step.because) {
            const member = story.byId.get(link.from);
            if (!member)
                continue;
            if (member.layer === "component")
                add(member.id);
            else
                for (const s of walk(member.id, depth + 1))
                    out.set(s.component, s);
        }
        const found = [...out.values()].sort((a, b) => a.component.localeCompare(b.component));
        cache.set(at, found);
        return found;
    };
    return walk(id, 0);
}
export function bandSubjectOf(index: GraphIndex, node: IndexNode): string | undefined {
    if (!node.group)
        return undefined;
    return index.groups.find((band) => band.id === node.group)?.subject;
}
export interface SubjectTrail {
    role: SubjectRole;
    component: string;
    label: string;
    steps: string[];
}
export function subjectTrail(index: GraphIndex, story: Story): SubjectTrail[] {
    const rows = new Map<string, SubjectTrail>();
    for (const step of story.steps) {
        if (step.layer === "component")
            continue;
        for (const subject of subjectsOf(index, story, step.id)) {
            const row = rows.get(subject.component) ?? { ...subject, steps: [] };
            row.steps.push(step.id);
            rows.set(subject.component, row);
        }
    }
    return [...rows.values()].sort((a, b) => story.steps.findIndex((s) => s.id === a.steps[0]) -
        story.steps.findIndex((s) => s.id === b.steps[0]));
}
