import type { Edge, IndexNode } from "../types.js";
import { groupKeyOf, type Graph } from "./selectors.js";
import { edgeId } from "../edge-id.js";
import { gateId } from "../gate-id.js";
import { displayBandOrder, conditionFamily } from "./display-groups.js";
export const NODE_W = 272;
export const HEADER_Y = 16;
export const LABEL_Y = 20;
export const LABEL_LINE_H = 15;
export const LABEL_CHARS = 34;
export const FOLD_LABEL_CHARS = 26;
export const LABEL_MAX_LINES = 2;
const LABEL_BASELINE_PAD = 11;
export function nodeHeight(lineCount: number, folded = false, subtitle = false): number {
    return (folded ? 32 : LABEL_Y) + (Math.max(1, lineCount) - 1) * LABEL_LINE_H + LABEL_BASELINE_PAD + (subtitle ? LABEL_LINE_H + 7 : 0);
}
export interface NodePresentation {
    label?: string;
    subtitle?: string;
}
export function nodeLines(node: IndexNode): string[] {
    if (node.fold)
        return wrapText(node.fold.heading, FOLD_LABEL_CHARS, LABEL_MAX_LINES);
    return wrapText(node.label, LABEL_CHARS, LABEL_MAX_LINES);
}
export const NODE_H = nodeHeight(LABEL_MAX_LINES);
export const NODE_PAD_X = 11;
export const GAP_Y = 9;
export const GAP_X = 118;
export const PAD_TOP = 96;
export const PAD_LEFT = 40;
export const BAND_GAP = 52;
export const BAND_PAD_X = 14;
export const BAND_PAD_Y = 11;
export const BAND_HEADER_H = 25;
export const BAND_LABEL_DY = 17;
export const FAMILY_HEADER_H = 42;
export const FAMILY_PAD = 10;
export const COLUMN_HEADER_Y = 44;
export const COLUMN_PITCH = NODE_W + GAP_X;
export const COLUMN_HEADER_SIZE = 28;
export const COLUMN_HEADER_EM = 0.68;
export function columnCentreX(x: number): number {
    return x + NODE_W / 2;
}
export const COLUMN_ARROW_R = 17;
export function columnArrowX(x: number, label: string, dir: -1 | 1): number {
    const half = (label.length * COLUMN_HEADER_SIZE * COLUMN_HEADER_EM) / 2;
    return columnCentreX(x) + dir * (half + COLUMN_ARROW_R + 18);
}
export const COLUMN_ARROW_Y = COLUMN_HEADER_Y - COLUMN_HEADER_SIZE * 0.34;
export function columnHeaderBox(x: number, label = ""): {
    x: number;
    y: number;
    w: number;
    h: number;
} {
    const limit = GAP_X / 2 - 2;
    const reach = COLUMN_ARROW_R + 10;
    const left = Math.max(x - limit, Math.min(x - BAND_PAD_X, columnArrowX(x, label, -1) - reach));
    const right = Math.min(x + NODE_W + limit, Math.max(x + NODE_W + BAND_PAD_X, columnArrowX(x, label, 1) + reach));
    return {
        x: left,
        y: COLUMN_HEADER_Y - COLUMN_HEADER_SIZE,
        w: right - left,
        h: COLUMN_HEADER_SIZE * 1.5,
    };
}
export const PORT_SPREAD = 58;
export const MAX_PORT_PITCH = 14;
export const GATE_W = 21;
export const GATE_H = 14;
export const GATE_PAD_Y = 3;
export const GATE_OPEN_PITCH = 7;
export const GATE_OPEN_R = 2.4;
export const GATE_STEM = 14;
export const GATE_GAP = 5;
export const GATE_MAX_OPEN = 2;
export function gateHeight(open: number): number {
    return GATE_H + open * GATE_OPEN_PITCH;
}
export const LOOP_MARGIN = 14;
export const LOOP_CLEAR = GAP_Y / 2;
export const LOOP_PITCH = 4;
export const LOOP_HOOK = 20;
const LOOP_ROOM = GAP_X - GATE_STEM - GATE_W - LOOP_HOOK;
export interface Junction {
    id: string;
    gatedId: string;
    edgeIds: string[];
    declared: number;
    openY: number[];
    partial: boolean;
    x: number;
    y: number;
    h: number;
    stem: EdgeGeometry;
}
export function gatePath(j: Junction): string {
    const rx = Math.min(GATE_W * 0.62, j.h / 2);
    const back = j.x + GATE_W - rx;
    return `M${j.x},${j.y} H${back} A${rx},${j.h / 2} 0 0 1 ${back},${j.y + j.h} H${j.x} Z`;
}
export interface Placed {
    node: IndexNode;
    x: number;
    y: number;
    h: number;
    lines: string[];
}
export interface EdgeGeometry {
    gateId?: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    loop?: Loop;
}
export interface Loop {
    y: number;
    x1: number;
    x2: number;
}
export interface Band {
    group: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ids: string[];
}
export interface LayoutResult {
    positions: Map<string, Placed>;
    edges: Map<string, EdgeGeometry[]>;
    edgePoints: Map<string, Float64Array[]>;
    edgeBounds: Map<string, Float64Array>;
    gates: Junction[];
    bands: Band[];
    familyBands?: Band[];
    width: number;
    height: number;
    columnX: number[];
}
export { groupKeyOf };
function edgeCurves(gm: EdgeGeometry): number[][] {
    const l = gm.loop;
    if (!l) {
        const mx = (gm.x1 + gm.x2) / 2;
        return [[gm.x1, gm.y1, mx, gm.y1, mx, gm.y2, gm.x2, gm.y2]];
    }
    const mx = (gm.x1 + l.x1) / 2;
    const mid = (l.x1 + l.x2) / 2;
    const back = l.x2 - LOOP_HOOK;
    return [
        [gm.x1, gm.y1, mx, gm.y1, mx, l.y, l.x1, l.y],
        [l.x1, l.y, mid, l.y, mid, l.y, l.x2, l.y],
        [l.x2, l.y, back, l.y, back, gm.y2, gm.x2, gm.y2],
    ];
}
export function edgePath(gm: EdgeGeometry): string {
    const curves = edgeCurves(gm);
    const start = curves[0]!;
    return curves.reduce((d, c) => `${d} C${c[2]},${c[3]} ${c[4]},${c[5]} ${c[6]},${c[7]}`, `M${start[0]},${start[1]}`);
}
function portOffsets(count: number, height: number): number[] {
    const pitch = Math.min(Math.min(PORT_SPREAD, height) / count, MAX_PORT_PITCH);
    const start = height / 2 - (pitch * (count - 1)) / 2;
    return Array.from({ length: count }, (_, i) => start + i * pitch);
}
interface Segment {
    id: string;
    edge: Edge;
    gate: number;
}
interface GateGroup {
    gi: number;
    declared: number;
    edges: Edge[];
    open: number;
    partial: boolean;
    h: number;
}
function gateGroups(g: Graph, drawable: Edge[], whole = false): Map<string, GateGroup[]> {
    const byPair = new Map<string, Edge>();
    for (const e of drawable)
        byPair.set(`${e.from} ${e.to}`, e);
    const out = new Map<string, GateGroup[]>();
    for (const [gatedId, gate] of Object.entries(g.index.gates)) {
        const groups = gate
            .map((group, gi) => {
            const edges = group.all.map((m) => byPair.get(`${m} ${gatedId}`)).filter((e) => !!e);
            const declared = group.all.length + (group.partial ? 1 : 0);
            return { gi, declared, edges, open: declared - edges.length, partial: !!group.partial };
        })
            .filter(({ declared, edges }) => declared > 1 && edges.length > 0)
            .filter(({ open, partial }) => !whole || open === (partial ? 1 : 0))
            .map((s) => ({ ...s, h: gateHeight(Math.min(s.open, GATE_MAX_OPEN)) }));
        if (groups.length)
            out.set(gatedId, groups);
    }
    return out;
}
function gutterHeight(groups: GateGroup[]): number {
    return groups.reduce((sum, s) => sum + s.h, 0) + GATE_GAP * (groups.length - 1);
}
function drawableEdges(g: Graph, placed: (id: string) => boolean): Edge[] {
    return g.index.edges.filter((e) => placed(e.from) && placed(e.to));
}
function placeGates(g: Graph, positions: Map<string, Placed>, drawable: Edge[], whole: boolean): Junction[] {
    const middleOf = (id: string) => {
        const p = positions.get(id)!;
        return p.y + p.h / 2;
    };
    const gates: Junction[] = [];
    for (const [gatedId, groups] of gateGroups(g, drawable, whole)) {
        const target = positions.get(gatedId);
        if (!target)
            continue;
        const stack = groups
            .map((s) => ({
            ...s,
            at: s.edges.reduce((sum, e) => sum + middleOf(e.from), 0) / s.edges.length,
        }))
            .sort((a, b) => a.at - b.at || a.gi - b.gi);
        const total = gutterHeight(stack);
        let y = target.y + target.h / 2 - total / 2;
        for (const s of stack) {
            gates.push({
                id: gateId(gatedId, s.gi),
                gatedId,
                edgeIds: s.edges.map((e) => edgeId(e.from, e.to)),
                declared: s.declared,
                partial: s.partial,
                x: target.x - GATE_STEM - GATE_W,
                y,
                h: s.h,
                openY: [],
                stem: { x1: 0, y1: 0, x2: 0, y2: 0 },
            });
            y += s.h + GATE_GAP;
        }
    }
    gates.sort((a, b) => a.id.localeCompare(b.id));
    const gutters = new Map<number, Junction[]>();
    for (const j of gates) {
        const list = gutters.get(j.x);
        if (list)
            list.push(j);
        else
            gutters.set(j.x, [j]);
    }
    for (const list of gutters.values()) {
        list.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
        const wanted = list.map((j) => j.y);
        let floor = -Infinity;
        for (const j of list) {
            j.y = Math.max(j.y, floor);
            floor = j.y + j.h + GATE_GAP;
        }
        const drift = list.reduce((sum, j, i) => sum + (j.y - wanted[i]!), 0) / list.length;
        for (const j of list)
            j.y -= drift;
    }
    return gates;
}
function routeLoops(gates: Junction[], positions: Map<string, Placed>, segments: Segment[], leaveY: Map<string, number>, gateInY: Map<string, number>, key: (s: Segment) => string): Map<string, Loop> {
    const gutter = new Map<string, {
        top: number;
        bottom: number;
    }>();
    for (const j of gates) {
        const run = gutter.get(j.gatedId);
        if (run) {
            run.top = Math.min(run.top, j.y);
            run.bottom = Math.max(run.bottom, j.y + j.h);
        }
        else
            gutter.set(j.gatedId, { top: j.y, bottom: j.y + j.h });
    }
    interface Bundle {
        gatedId: string;
        above: boolean;
        list: Segment[];
    }
    const bundles = new Map<string, Bundle>();
    for (const s of segments) {
        if (s.gate < 0)
            continue;
        const j = gates[s.gate]!;
        if (positions.get(s.edge.from)!.x + NODE_W <= j.x)
            continue;
        const box = positions.get(j.gatedId)!;
        const above = leaveY.get(key(s))! < box.y + box.h / 2;
        const id = `${j.gatedId}#${above ? "above" : "below"}`;
        const bundle = bundles.get(id);
        if (bundle)
            bundle.list.push(s);
        else
            bundles.set(id, { gatedId: j.gatedId, above, list: [s] });
    }
    const loops = new Map<string, Loop>();
    for (const { gatedId, above, list } of bundles.values()) {
        const box = positions.get(gatedId)!;
        const run = gutter.get(gatedId)!;
        const base = above
            ? Math.min(box.y, run.top) - LOOP_CLEAR
            : Math.max(box.y + box.h, run.bottom) + LOOP_CLEAR;
        list.sort((a, b) => Math.abs(gateInY.get(key(a))! - base) - Math.abs(gateInY.get(key(b))! - base) ||
            key(a).localeCompare(key(b)));
        list.forEach((s, i) => loops.set(key(s), {
            y: base + (above ? -1 : 1) * i * LOOP_PITCH,
            x1: box.x + NODE_W + LOOP_MARGIN,
            x2: gates[s.gate]!.x - Math.min(LOOP_MARGIN + i * LOOP_PITCH, LOOP_ROOM),
        }));
    }
    return loops;
}
function computeEdgeGeometry(g: Graph, positions: Map<string, Placed>, whole: boolean): Pick<LayoutResult, "edges" | "edgePoints" | "edgeBounds" | "gates"> {
    const drawable = drawableEdges(g, (id) => positions.has(id));
    const gates = placeGates(g, positions, drawable, whole);
    const gateOf = new Map<string, number[]>();
    gates.forEach((j, i) => {
        for (const id of j.edgeIds) {
            const list = gateOf.get(id);
            if (list)
                list.push(i);
            else
                gateOf.set(id, [i]);
        }
    });
    const solo = (e: Edge) => e.groups.length === 0 || e.groups.some((gi) => (g.index.gates[e.to]?.[gi]?.all.length ?? 1) < 2);
    const segments: Segment[] = [];
    for (const e of drawable) {
        const id = edgeId(e.from, e.to);
        const feeds = gateOf.get(id);
        if (feeds)
            for (const gi of feeds)
                segments.push({ id, edge: e, gate: gi });
        else if (solo(e))
            segments.push({ id, edge: e, gate: -1 });
    }
    const centreOf = (id: string) => {
        const p = positions.get(id)!;
        return p.y + p.h / 2;
    };
    const targetY = (s: Segment) => s.gate < 0 ? centreOf(s.edge.to) : gates[s.gate]!.y + gates[s.gate]!.h / 2;
    const key = (s: Segment) => `${s.id}#${s.gate}`;
    const leaveY = new Map<string, number>();
    const bySource = new Map<string, Segment[]>();
    for (const s of segments) {
        const list = bySource.get(s.edge.from);
        if (list)
            list.push(s);
        else
            bySource.set(s.edge.from, [s]);
    }
    for (const [nodeId, list] of bySource) {
        const placed = positions.get(nodeId)!;
        list.sort((a, b) => targetY(a) - targetY(b) || key(a).localeCompare(key(b)));
        const offsets = portOffsets(list.length, placed.h);
        list.forEach((s, i) => leaveY.set(key(s), placed.y + offsets[i]!));
    }
    const arriveY = new Map<string, number>();
    type Arrival = {
        key: string;
        from: number;
    };
    const byTarget = new Map<string, Arrival[]>();
    const arriveAt = (nodeId: string, a: Arrival) => {
        const list = byTarget.get(nodeId);
        if (list)
            list.push(a);
        else
            byTarget.set(nodeId, [a]);
    };
    for (const s of segments) {
        if (s.gate < 0)
            arriveAt(s.edge.to, { key: key(s), from: centreOf(s.edge.from) });
    }
    for (const j of gates)
        arriveAt(j.gatedId, { key: j.id, from: j.y + j.h / 2 });
    for (const [nodeId, list] of byTarget) {
        const placed = positions.get(nodeId)!;
        list.sort((a, b) => a.from - b.from || a.key.localeCompare(b.key));
        const offsets = portOffsets(list.length, placed.h);
        list.forEach((a, i) => arriveY.set(a.key, placed.y + offsets[i]!));
    }
    const gateInY = new Map<string, number>();
    for (const j of gates) {
        const target = positions.get(j.gatedId)!;
        j.stem = {
            x1: j.x + GATE_W,
            y1: j.y + j.h / 2,
            x2: target.x,
            y2: arriveY.get(j.id)!,
        };
        const inputs = segments
            .filter((s) => gates[s.gate] === j)
            .sort((a, b) => leaveY.get(key(a))! - leaveY.get(key(b))! || key(a).localeCompare(key(b)));
        const missing = Math.min(j.declared - inputs.length, GATE_MAX_OPEN);
        j.openY = Array.from({ length: missing }, (_, i) => j.y + GATE_PAD_Y + GATE_OPEN_PITCH * i);
        const top = j.y + GATE_PAD_Y + GATE_OPEN_PITCH * missing;
        const bottom = j.y + j.h - GATE_PAD_Y;
        inputs.forEach((s, i) => gateInY.set(key(s), inputs.length > 1 ? top + ((bottom - top) * i) / (inputs.length - 1) : (top + bottom) / 2));
    }
    const loops = routeLoops(gates, positions, segments, leaveY, gateInY, key);
    const edges = new Map<string, EdgeGeometry[]>();
    const edgePoints = new Map<string, Float64Array[]>();
    const edgeBounds = new Map<string, Float64Array>();
    for (const s of segments) {
        const a = positions.get(s.edge.from)!;
        const j = s.gate < 0 ? null : gates[s.gate]!;
        const gm: EdgeGeometry = {
            gateId: j?.id,
            x1: a.x + NODE_W,
            y1: leaveY.get(key(s))!,
            x2: j ? j.x : positions.get(s.edge.to)!.x,
            y2: j ? gateInY.get(key(s))! : arriveY.get(key(s))!,
            loop: loops.get(key(s)),
        };
        const pts = flattenPath(gm);
        push(edges, s.id, gm);
        push(edgePoints, s.id, pts);
        const bounds = boundsOf(pts);
        const known = edgeBounds.get(s.id);
        edgeBounds.set(s.id, known ? union(known, bounds) : bounds);
    }
    return { edges, edgePoints, edgeBounds, gates };
}
function push<T>(m: Map<string, T[]>, k: string, v: T): void {
    const list = m.get(k);
    if (list)
        list.push(v);
    else
        m.set(k, [v]);
}
function union(a: Float64Array, b: Float64Array): Float64Array {
    return new Float64Array([
        Math.min(a[0]!, b[0]!),
        Math.min(a[1]!, b[1]!),
        Math.max(a[2]!, b[2]!),
        Math.max(a[3]!, b[3]!),
    ]);
}
function barycenterOrder(g: Graph, columns: IndexNode[][], regroup: (col: IndexNode[], ci: number) => IndexNode[], sweeps = 4): void {
    const indexIn = (col: IndexNode[]) => new Map(col.map((n, i) => [n.id, i]));
    for (let sweep = 0; sweep < sweeps; sweep++) {
        const forward = sweep % 2 === 0;
        const range = forward
            ? [...columns.keys()].slice(1)
            : [...columns.keys()].slice(0, -1).reverse();
        for (const ci of range) {
            const neighborCol = columns[forward ? ci - 1 : ci + 1];
            if (!neighborCol?.length)
                continue;
            const pos = indexIn(neighborCol);
            const scored = columns[ci].map((node, i) => {
                const neighbors = (forward ? g.incoming.get(node.id) : g.outgoing.get(node.id)) ?? [];
                const values = neighbors.map((id) => pos.get(id)).filter((v): v is number => v !== undefined);
                const bary = values.length ? values.reduce((a, b) => a + b, 0) / values.length : i;
                return { node, bary, i };
            });
            scored.sort((a, b) => a.bary - b.bary || a.i - b.i);
            columns[ci] = regroup(scored.map((s) => s.node), ci);
        }
    }
}
function bandSorter(g: Graph): (col: IndexNode[]) => IndexNode[] {
    const order = displayBandOrder(g.index);
    const rank = (node: IndexNode) => {
        const key = groupKeyOf(node);
        const i = key ? order.indexOf(key) : -1;
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const within = (node: IndexNode) => node.order ?? Number.MAX_SAFE_INTEGER;
    return (col) => col.some((n) => groupKeyOf(n))
        ? [...col].sort((a, b) => rank(a) - rank(b) || within(a) - within(b))
        : col;
}
function stackColumn(col: IndexNode[], rowHeight: (node: IndexNode) => number): {
    offsets: number[];
    total: number;
} {
    const offsets: number[] = [];
    let y = 0;
    col.forEach((node, i) => {
        const previous = col[i - 1];
        const family = expandedConditionFamily(node);
        const previousFamily = previous && expandedConditionFamily(previous);
        if (previous) {
            y += GAP_Y;
            const key = groupKeyOf(node);
            const prev = previous ? groupKeyOf(previous) : undefined;
            if (key && prev && key !== prev)
                y += node.fold && previous.fold ? GAP_Y : BAND_GAP;
        }
        if (previousFamily && previousFamily !== family)
            y += BAND_PAD_Y + FAMILY_PAD;
        if (family && family !== previousFamily)
            y += FAMILY_HEADER_H + (node.fold ? 0 : BAND_HEADER_H);
        offsets.push(y);
        y += rowHeight(node);
    });
    if (col.length && expandedConditionFamily(col[col.length - 1]!))
        y += BAND_PAD_Y + FAMILY_PAD;
    return { offsets, total: y };
}
function expandedConditionFamily(node: IndexNode): string | undefined {
    const family = node.layer === "condition" ? conditionFamily(node.group) : undefined;
    return family && node.fold?.key !== family ? family : undefined;
}
function computeFamilyBands(col: IndexNode[], positions: Map<string, Placed>, x: number): Band[] {
    const families = new Map<string, IndexNode[]>();
    for (const node of col) {
        const family = expandedConditionFamily(node);
        if (family)
            families.set(family, [...(families.get(family) ?? []), node]);
    }
    return [...families].map(([group, nodes]) => {
        const first = positions.get(nodes[0]!.id)!;
        const last = positions.get(nodes[nodes.length - 1]!.id)!;
        const y = first.y - (nodes[0]!.fold ? 0 : BAND_HEADER_H) - FAMILY_HEADER_H;
        return { group, x: x - BAND_PAD_X - FAMILY_PAD, y,
            width: NODE_W + 2 * (BAND_PAD_X + FAMILY_PAD),
            height: last.y + last.h + BAND_PAD_Y + FAMILY_PAD - y,
            ids: nodes.map(node => node.id) };
    });
}
function computeBands(col: IndexNode[], positions: Map<string, Placed>, x: number): Band[] {
    const bands: Band[] = [];
    let run: IndexNode[] = [];
    const flush = () => {
        if (!run.length)
            return;
        if (run.length === 1 && run[0]!.fold) {
            run = [];
            return;
        }
        const y = positions.get(run[0]!.id)!.y - BAND_HEADER_H;
        const last = positions.get(run[run.length - 1]!.id)!;
        bands.push({
            group: groupKeyOf(run[0]!)!,
            x: x - BAND_PAD_X,
            y,
            width: NODE_W + BAND_PAD_X * 2,
            height: last.y + last.h + BAND_PAD_Y - y,
            ids: run.map((n) => n.id),
        });
        run = [];
    };
    for (const node of col) {
        const key = groupKeyOf(node);
        if (!key)
            continue;
        if (run.length && groupKeyOf(run[0]!) !== key)
            flush();
        run.push(node);
    }
    flush();
    return bands;
}
export function computeLayout(g: Graph, options: {
    order?: boolean;
    partialGates?: boolean;
    nodePresentation?: ReadonlyMap<string, NodePresentation>;
} = {}): LayoutResult {
    const whole = options.partialGates === false;
    const columns = g.columns.map((col) => [...col]);
    const sorter = bandSorter(g);
    const regroup = (col: IndexNode[]) => sorter(col);
    if (options.order !== false)
        barycenterOrder(g, columns, regroup);
    columns.forEach((col, ci) => {
        columns[ci] = regroup(col);
    });
    const wrapped = new Map<string, string[]>();
    for (const col of columns) {
        for (const node of col) {
            const label = options.nodePresentation?.get(node.id)?.label;
            wrapped.set(node.id, nodeLines(label && !node.fold ? { ...node, label } : node));
        }
    }
    const heightOf = (node: IndexNode) => nodeHeight(wrapped.get(node.id)!.length, !!node.fold, !node.fold && !!options.nodePresentation?.get(node.id)?.subtitle);
    const placed = new Set(columns.flat().map((n) => n.id));
    const gutters = gateGroups(g, drawableEdges(g, (id) => placed.has(id)), whole);
    const rowHeight = (node: IndexNode) => {
        const groups = gutters.get(node.id);
        return Math.max(heightOf(node), groups ? gutterHeight(groups) : 0);
    };
    const stacks = columns.map((col) => stackColumn(col, rowHeight));
    const fullHeight = Math.max(...stacks.map((s) => s.total), 1);
    const positions = new Map<string, Placed>();
    const columnX: number[] = [];
    columns.forEach((col, ci) => {
        const x = PAD_LEFT + ci * (NODE_W + GAP_X);
        columnX[ci] = x;
        const y0 = PAD_TOP + (fullHeight - stacks[ci]!.total) / 2;
        col.forEach((node, i) => {
            const lines = wrapped.get(node.id)!;
            const h = heightOf(node);
            positions.set(node.id, {
                node,
                x,
                y: y0 + stacks[ci]!.offsets[i]! + (rowHeight(node) - h) / 2,
                h,
                lines,
            });
        });
    });
    const bands = columns.flatMap((col, ci) => col.some((n) => groupKeyOf(n)) ? computeBands(col, positions, columnX[ci]!) : []);
    return {
        positions,
        ...computeEdgeGeometry(g, positions, whole),
        bands,
        familyBands: columns.flatMap((col, ci) => computeFamilyBands(col, positions, columnX[ci]!)),
        width: PAD_LEFT * 2 + columns.length * NODE_W + (columns.length - 1) * GAP_X,
        height: PAD_TOP + fullHeight + 60,
        columnX,
    };
}
function sampleCount(curve: number[]): number {
    const len = Math.hypot(curve[6]! - curve[0]!, curve[7]! - curve[1]!);
    return Math.max(8, Math.min(96, Math.ceil(len / 20)));
}
export function flattenPath(gm: EdgeGeometry): Float64Array {
    const curves = edgeCurves(gm);
    const counts = curves.map(sampleCount);
    const pts = new Float64Array(counts.reduce((n, c) => n + c, 1) * 2);
    pts[0] = curves[0]![0]!;
    pts[1] = curves[0]![1]!;
    let at = 1;
    curves.forEach((c, ci) => {
        const n = counts[ci]!;
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const u = 1 - t;
            pts[at * 2] =
                u * u * u * c[0]! + 3 * u * u * t * c[2]! + 3 * u * t * t * c[4]! + t * t * t * c[6]!;
            pts[at * 2 + 1] =
                u * u * u * c[1]! + 3 * u * u * t * c[3]! + 3 * u * t * t * c[5]! + t * t * t * c[7]!;
            at++;
        }
    });
    return pts;
}
function boundsOf(pts: Float64Array): Float64Array {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i]!;
        const y = pts[i + 1]!;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    return new Float64Array([minX, minY, maxX, maxY]);
}
function distSqToPolyline(pts: Float64Array, px: number, py: number): number {
    let best = Infinity;
    for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i]!;
        const ay = pts[i + 1]!;
        const bx = pts[i + 2]!;
        const by = pts[i + 3]!;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        const ex = px - (ax + t * dx);
        const ey = py - (ay + t * dy);
        const d = ex * ex + ey * ey;
        if (d < best)
            best = d;
    }
    return best;
}
export type Hit = {
    kind: "node";
    id: string;
} | {
    kind: "edge";
    id: string;
} | {
    kind: "gate";
    id: string;
} | {
    kind: "band";
    id: string;
} | null;
export function hitTest(layout: LayoutResult, ux: number, uy: number, radius: number, edgeIsLive: (id: string) => boolean = () => true): Hit {
    for (const p of layout.positions.values()) {
        if (ux >= p.x && ux <= p.x + NODE_W && uy >= p.y && uy <= p.y + p.h) {
            return { kind: "node", id: p.node.id };
        }
    }
    for (const j of layout.gates) {
        if (!j.edgeIds.some(edgeIsLive))
            continue;
        const inGlyph = ux >= j.x && ux <= j.x + GATE_W && uy >= j.y && uy <= j.y + j.h;
        const onStem = ux >= j.stem.x1 - radius &&
            ux <= j.stem.x2 + radius &&
            distSqToPolyline(flattenPath(j.stem), ux, uy) < radius * radius;
        if (inGlyph || onStem)
            return { kind: "gate", id: j.id };
    }
    for (const band of [...layout.bands, ...(layout.familyBands ?? [])]) {
        if (ux >= band.x && ux <= band.x + band.width && uy >= band.y && uy <= band.y + band.height) {
            return { kind: "band", id: band.group };
        }
    }
    let best: string | null = null;
    let bestSq = radius * radius;
    for (const [id, segments] of layout.edgePoints) {
        if (!edgeIsLive(id))
            continue;
        const b = layout.edgeBounds.get(id)!;
        if (ux < b[0]! - radius || ux > b[2]! + radius)
            continue;
        if (uy < b[1]! - radius || uy > b[3]! + radius)
            continue;
        for (const pts of segments) {
            const d = distSqToPolyline(pts, ux, uy);
            if (d < bestSq) {
                bestSq = d;
                best = id;
            }
        }
    }
    return best ? { kind: "edge", id: best } : null;
}
export function nodesInRect(layout: LayoutResult, ax: number, ay: number, bx: number, by: number): string[] {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const ids: string[] = [];
    for (const p of layout.positions.values()) {
        if (p.x <= maxX && p.x + NODE_W >= minX && p.y <= maxY && p.y + p.h >= minY) {
            ids.push(p.node.id);
        }
    }
    return ids;
}
export function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxChars && current) {
            lines.push(current);
            current = word;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        lines.push(current);
    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, "…");
        return kept;
    }
    return lines;
}
