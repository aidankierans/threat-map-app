import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { IndexNode } from "../types.js";
import { columnHeaderBox, computeLayout, edgePath, gatePath, hitTest, nodesInRect, columnArrowX, columnCentreX, BAND_LABEL_DY, BAND_PAD_X, COLUMN_ARROW_R, COLUMN_ARROW_Y, COLUMN_HEADER_SIZE, COLUMN_HEADER_Y, GATE_OPEN_R, HEADER_Y, LABEL_LINE_H, LABEL_Y, NODE_PAD_X, NODE_W, wrapText, LABEL_CHARS, FOLD_LABEL_CHARS, type NodePresentation, type Band, type Hit, type Junction, type LayoutResult, } from "./layout.js";
import { moveColumn, relatedDistance, runsAgainstOrder, bandDetailOf, type Graph as GraphModel, } from "./selectors.js";
import { edgeId } from "../edge-id.js";
import { foldKeyOf } from "./fold.js";
import type { TourState } from "./tour.js";
const HIT_RADIUS_PX = 9;
const HIT_HALO = 3;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
const DRAG_SLOP_PX = 3;
const PRESS_MS = 420;
const isAdditive = (e: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
}) => e.shiftKey || e.metaKey || e.ctrlKey;
export type HoverTarget = ({
    kind: "node";
    node: IndexNode;
} | {
    kind: "edge";
    id: string;
} | {
    kind: "gate";
    gate: Junction;
} | {
    kind: "band";
    group: string;
    count: number;
}) & {
    x: number;
    y: number;
    via?: "press";
};
interface Props {
    tour?: Pick<TourState, "current" | "established" | "later" | "actors" | "limit"> & {
        currentEdges?: ReadonlySet<string>;
        currentGates?: ReadonlySet<string>;
    };
    graph: GraphModel;
    visible: Set<string>;
    hits: ReadonlySet<string>;
    held: ReadonlySet<string>;
    selection: string[];
    onSelect: (id: string | string[], additive: boolean) => void;
    onClear: () => void;
    onHover: (target: HoverTarget | null) => void;
    onArrange?: (columns: string[]) => void;
    partialGates: boolean;
    story?: {
        nodes: ReadonlySet<string>;
        edges: ReadonlySet<string>;
    } | null;
    onToggleFold?: (key: string, collapsed?: boolean) => void;
    anchor?: string | null;
    focusTarget?: ({
        id: string;
    } | {
        ids: string[];
    }) & {
        sequence: number;
    } | null;
    nodePresentation?: ReadonlyMap<string, NodePresentation>;
    children?: preact.ComponentChildren;
}
interface Transform {
    x: number;
    y: number;
    k: number;
}
interface Box {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}
function bandAnchor(layout: LayoutResult, key: string): {
    x: number;
    y: number;
} | null {
    const box = layout.positions.get(`fold:${key}`);
    if (box)
        return { x: box.x, y: box.y };
    const frame = [...layout.bands, ...(layout.familyBands ?? [])].find((b) => b.group === key);
    return frame ? { x: frame.x + BAND_PAD_X, y: frame.y } : null;
}
const DOUBLE_CLICK_MS = 400;
export function GraphCanvas({ graph: sourceGraph, visible, hits, held, selection, onSelect, onClear, onHover, onArrange, partialGates, story, tour, onToggleFold, anchor, focusTarget, nodePresentation, children, }: Props) {
    const graph = useMemo(() => {
        const columns = sourceGraph.columns.filter(column => column.length);
        if (columns.length === sourceGraph.columns.length)
            return sourceGraph;
        return { ...sourceGraph, columns, columnOf: new Map(columns.map((column, i) => [column[0].layer as string, i])) };
    }, [sourceGraph]);
    const svgRef = useRef<SVGSVGElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
    const [viewport, setViewport] = useState({ width: 1200, height: 800 });
    const dragRef = useRef<{
        pointerId: number;
        x: number;
        y: number;
        tx: number;
        ty: number;
        moved: boolean;
        mode: "pan" | "lasso";
        box: Box | null;
    } | null>(null);
    const [lasso, setLasso] = useState<Box | null>(null);
    const pointersRef = useRef(new Map<number, {
        x: number;
        y: number;
    }>());
    const pinchRef = useRef<{
        dist: number;
        cx: number;
        cy: number;
        t: Transform;
    } | null>(null);
    const hoverRef = useRef<string | null>(null);
    const pressRef = useRef<{
        pointerId: number;
        x: number;
        y: number;
    } | null>(null);
    const pressTimer = useRef<number | null>(null);
    const boxRef = useRef<{
        width: number;
        top: number;
    } | null>(null);
    const layoutRef = useRef<LayoutResult | null>(null);
    const pendingFit = useRef(false);
    const anchorRef = useRef<string | null>(null);
    const lastClickRef = useRef<{
        key: string;
        at: number;
    } | null>(null);
    const presentationKey = JSON.stringify([...(nodePresentation ?? [])].sort(([a], [b]) => a.localeCompare(b)));
    const layout: LayoutResult = useMemo(() => computeLayout(graph, { partialGates, nodePresentation }), [graph, partialGates, presentationKey]);
    const columnHeaders = useMemo(() => graph.index.layers
        .filter((layer) => graph.columnOf.has(layer.name))
        .map((layer) => ({ name: layer.name as string, label: layer.label }))
        .sort((a, b) => graph.columnOf.get(a.name)! - graph.columnOf.get(b.name)!), [graph]);
    const arrange = (from: number, to: number) => {
        if (to === from || to < 0 || to >= columnHeaders.length)
            return;
        const visibleOrder = moveColumn(columnHeaders.map((h) => h.name), from, to);
        const sourceOrder = [...sourceGraph.columnOf].sort((a, b) => a[1] - b[1]).map(([name]) => name);
        onArrange?.(sourceOrder.map(name => graph.columnOf.has(name) ? visibleOrder.shift()! : name));
    };
    const graphPoint = (clientX: number, clientY: number): {
        x: number;
        y: number;
    } | null => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || !(transform.k > 0))
            return null;
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k,
        };
    };
    const pinchSpan = (): {
        dist: number;
        cx: number;
        cy: number;
    } | null => {
        const [a, b] = [...pointersRef.current.values()];
        const rect = svgRef.current?.getBoundingClientRect();
        if (!a || !b || !rect)
            return null;
        return {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            cx: (a.x + b.x) / 2 - rect.left,
            cy: (a.y + b.y) / 2 - rect.top,
        };
    };
    const dropPointer = (pointerId: number) => {
        pointersRef.current.delete(pointerId);
        if (pointersRef.current.size >= 2)
            return;
        if (!pinchRef.current)
            return;
        pinchRef.current = null;
        const [rest] = [...pointersRef.current.entries()];
        dragRef.current = rest
            ? {
                pointerId: rest[0],
                x: rest[1].x,
                y: rest[1].y,
                tx: transform.x,
                ty: transform.y,
                moved: true,
                mode: "pan",
                box: null,
            }
            : null;
    };
    const related = useMemo(() => selection.length
        ? relatedDistance(graph, selection, { allow: (id) => visible.has(id) })
        : null, [graph, selection, visible]);
    const fit = useMemo(() => () => {
        const rect = viewRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
            pendingFit.current = true;
            return;
        }
        pendingFit.current = false;
        const controls = viewRef.current?.querySelector(".panelctl")?.getBoundingClientRect();
        const topInset = controls ? Math.max(10, controls.bottom - rect.top + 12) : 10;
        const availableHeight = Math.max(1, rect.height - topInset - 10);
        const k = Math.min(rect.width / layout.width, availableHeight / layout.height, 1) * 0.98;
        setTransform({ x: (rect.width - layout.width * k) / 2, y: topInset, k });
    }, [layout]);
    useEffect(() => {
        const measure = () => {
            const view = viewRef.current?.getBoundingClientRect();
            const box = svgRef.current?.getBoundingClientRect();
            if (!view || !box)
                return;
            const prev = boxRef.current;
            boxRef.current = { width: box.width, top: box.top };
            if (prev) {
                const grew = box.width - prev.width;
                const dropped = box.top - prev.top;
                if (grew !== 0 || dropped !== 0) {
                    setTransform((t) => ({ ...t, x: t.x + grew / 2, y: t.y - dropped }));
                }
            }
            setViewport({ width: view.width, height: view.height });
            if (pendingFit.current)
                fit();
        };
        measure();
        const previous = layoutRef.current;
        layoutRef.current = layout;
        const key = anchorRef.current ?? anchor ?? null;
        anchorRef.current = null;
        const from = key && previous ? bandAnchor(previous, key) : null;
        const to = key ? bandAnchor(layout, key) : null;
        if (previous && from && to) {
            setTransform((t) => ({ ...t, x: t.x - (to.x - from.x) * t.k, y: t.y - (to.y - from.y) * t.k }));
        }
        else {
            fit();
        }
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        if (svgRef.current)
            observer?.observe(svgRef.current);
        if (viewRef.current)
            observer?.observe(viewRef.current);
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
        };
    }, [fit]);
    useEffect(() => {
        const ids = focusTarget ? "ids" in focusTarget ? focusTarget.ids : [focusTarget.id] : [];
        const positions = ids.flatMap(id => { const pos = layout.positions.get(id); return pos ? [pos] : []; });
        const rect = viewRef.current?.getBoundingClientRect();
        if (!positions.length || !rect?.width || !rect.height)
            return;
        const left = Math.min(...positions.map(p => p.x));
        const right = Math.max(...positions.map(p => p.x + NODE_W));
        const top = Math.min(...positions.map(p => p.y));
        const bottom = Math.max(...positions.map(p => p.y + p.h));
        const k = Math.min(1.25, Math.max(1, rect.width - 48) / (right - left), Math.max(1, rect.height - 48) / (bottom - top));
        setTransform({ x: rect.width / 2 - (left + right) / 2 * k, y: rect.height / 2 - (top + bottom) / 2 * k, k });
    }, [focusTarget, layout]);
    useEffect(() => {
        const mark = (on: boolean) => {
            const svg = svgRef.current;
            if (!svg)
                return;
            if (on)
                svg.setAttribute("data-lasso", "");
            else
                svg.removeAttribute("data-lasso");
        };
        const onKey = (e: KeyboardEvent) => mark(e.shiftKey);
        const onBlur = () => mark(false);
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKey);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("keyup", onKey);
            window.removeEventListener("blur", onBlur);
        };
    }, []);
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg)
            return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            setTransform((t) => {
                const factor = Math.exp(-e.deltaY * 0.0015);
                const k = clampZoom(t.k * factor);
                return { k, x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k) };
            });
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        const swallow = (e: Event) => e.preventDefault();
        for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
            svg.addEventListener(name, swallow, { passive: false });
        }
        return () => {
            svg.removeEventListener("wheel", onWheel);
            for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
                svg.removeEventListener(name, swallow);
            }
        };
    }, []);
    const zoomBy = (factor: number) => {
        setTransform((t) => {
            const k = clampZoom(t.k * factor);
            const cx = viewport.width / 2;
            const cy = viewport.height / 2;
            return { k, x: cx - (cx - t.x) * (k / t.k), y: cy - (cy - t.y) * (k / t.k) };
        });
    };
    const tierOf = (id: string): "sel" | "near" | "mid" | "far" | "cold" | "now" | "done" => {
        if (tour)
            return selection.includes(id) ? "sel" : tour.current.has(id) ? "now" : tour.established.has(id) ? "done" : tour.later.has(id) ? "near" : "cold";
        if (selection.includes(id))
            return "sel";
        if (hits.has(id))
            return "near";
        if (!visible.has(id))
            return "cold";
        if (story)
            return story.nodes.has(id) ? "near" : "cold";
        if (!related)
            return "near";
        const d = related.dist.get(id);
        if (d === undefined)
            return "cold";
        return d <= 1 ? "near" : d === 2 ? "mid" : "far";
    };
    const graded = related !== null || story != null || tour != null;
    const isDim = (id: string) => tierOf(id) === "cold";
    const TIERS = ["cold", "far", "mid", "near"] as const;
    const edgeTier = (id: string): "near" | "mid" | "far" | "cold" => {
        const edge = graph.edgeById.get(id);
        if (!edge)
            return "cold";
        const ends = [tierOf(edge.from), tierOf(edge.to)];
        return TIERS.find((t) => ends.includes(t)) ?? "near";
    };
    const intoGate = useMemo(() => new Set(layout.gates.flatMap((j) => j.edgeIds)), [layout]);
    const edgeIsLive = (id: string) => {
        if (selection.includes(id))
            return true;
        const edge = graph.edgeById.get(id);
        return !!edge && !isDim(edge.from) && !isDim(edge.to);
    };
    const hitAt = (clientX: number, clientY: number): Hit => {
        const point = graphPoint(clientX, clientY);
        if (!point)
            return null;
        return hitTest(layout, point.x, point.y, HIT_RADIUS_PX / transform.k, edgeIsLive);
    };
    const isSecondClickOn = (key: string): boolean => {
        const last = lastClickRef.current;
        const now = performance.now();
        lastClickRef.current = { key, at: now };
        return !!last && last.key === key && now - last.at < DOUBLE_CLICK_MS;
    };
    const bandSelection = (group: string): string[] => {
        const frame = [...layout.bands, ...(layout.familyBands ?? [])].find((b) => b.group === group);
        if (frame)
            return frame.ids.filter((id) => visible.has(id)).flatMap(id => graph.fold?.members.get(id) ?? [id]);
        const standIn = `fold:${group}`;
        const members = graph.fold?.members.get(standIn) ?? [];
        return visible.has(standIn) ? members : [];
    };
    const unfold = (id: string): string | string[] => {
        const key = foldKeyOf(id);
        if (key !== undefined)
            return `group:${key}`;
        return graph.fold?.edges.get(id) ?? id;
    };
    const updateHover = (clientX: number, clientY: number, via?: "press") => {
        const hit = hitAt(clientX, clientY);
        const id = hit?.id ?? null;
        if (id === hoverRef.current && !via)
            return;
        hoverRef.current = id;
        const at = { x: clientX, y: clientY, via };
        if (!hit)
            return onHover(null);
        if (hit.kind === "edge")
            return onHover({ kind: "edge", id: hit.id, ...at });
        if (hit.kind === "gate") {
            const gate = layout.gates.find((j) => j.id === hit.id);
            return onHover(gate ? { kind: "gate", gate, ...at } : null);
        }
        if (hit.kind === "band") {
            return onHover({ kind: "band", group: hit.id, count: bandSelection(hit.id).length, ...at });
        }
        const key = foldKeyOf(hit.id);
        if (key !== undefined) {
            return onHover({ kind: "band", group: key, count: bandSelection(key).length, ...at });
        }
        const node = graph.byId.get(hit.id);
        onHover(node ? { kind: "node", node, ...at } : null);
    };
    const endHover = () => {
        hoverRef.current = null;
        onHover(null);
    };
    const endPress = () => {
        if (pressTimer.current !== null) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
        pressRef.current = null;
    };
    const beginPress = (pointerId: number, x: number, y: number) => {
        endPress();
        pressRef.current = { pointerId, x, y };
        pressTimer.current = window.setTimeout(() => {
            pressTimer.current = null;
            pressRef.current = null;
            dragRef.current = null;
            setLasso(null);
            updateHover(x, y, "press");
        }, PRESS_MS);
    };
    return (<div class={`canvas ${tour ? "case-canvas" : ""}`}>
      <svg ref={svgRef} id="graph-canvas" data-walkthrough="map-canvas" class={lasso ? "lassoing" : dragRef.current ? "grabbing" : ""} onPointerDown={(e) => {
            pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointersRef.current.size >= 2) {
                dragRef.current = null;
                setLasso(null);
                endPress();
                endHover();
                const span = pinchSpan();
                pinchRef.current = span ? { ...span, t: transform } : null;
                (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
                return;
            }
            if (e.button !== 0 || !e.isPrimary)
                return;
            dragRef.current = {
                pointerId: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                tx: transform.x,
                ty: transform.y,
                moved: false,
                mode: e.shiftKey ? "lasso" : "pan",
                box: null,
            };
            (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
            if (e.pointerType !== "mouse") {
                endHover();
                beginPress(e.pointerId, e.clientX, e.clientY);
            }
        }} onPointerMove={(e) => {
            if (pointersRef.current.has(e.pointerId)) {
                pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }
            const held = pressRef.current;
            if (held &&
                held.pointerId === e.pointerId &&
                (Math.abs(e.clientX - held.x) > DRAG_SLOP_PX ||
                    Math.abs(e.clientY - held.y) > DRAG_SLOP_PX)) {
                endPress();
            }
            const pinch = pinchRef.current;
            if (pinch) {
                const span = pinchSpan();
                if (!span || !(pinch.dist > 0) || !(pinch.t.k > 0))
                    return;
                const k = clampZoom(pinch.t.k * (span.dist / pinch.dist));
                setTransform({
                    k,
                    x: span.cx - ((pinch.cx - pinch.t.x) / pinch.t.k) * k,
                    y: span.cy - ((pinch.cy - pinch.t.y) / pinch.t.k) * k,
                });
                return;
            }
            const d = dragRef.current;
            if (!d || d.pointerId !== e.pointerId) {
                updateHover(e.clientX, e.clientY);
                return;
            }
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && (Math.abs(dx) > DRAG_SLOP_PX || Math.abs(dy) > DRAG_SLOP_PX)) {
                d.moved = true;
                endHover();
            }
            if (d.mode === "lasso") {
                if (!d.moved)
                    return;
                const from = graphPoint(d.x, d.y);
                const to = graphPoint(e.clientX, e.clientY);
                if (from && to) {
                    d.box = { ax: from.x, ay: from.y, bx: to.x, by: to.y };
                    setLasso(d.box);
                }
                return;
            }
            setTransform((t) => ({ ...t, x: d.tx + dx, y: d.ty + dy }));
        }} onPointerUp={(e) => {
            endPress();
            if (pinchRef.current) {
                dropPointer(e.pointerId);
                return;
            }
            dropPointer(e.pointerId);
            const d = dragRef.current;
            dragRef.current = null;
            setLasso(null);
            if (!d || d.pointerId !== e.pointerId)
                return;
            if (d.moved) {
                const box = d.box;
                if (d.mode === "lasso" && box) {
                    const ids = nodesInRect(layout, box.ax, box.ay, box.bx, box.by)
                        .filter((id) => visible.has(id))
                        .flatMap((id) => graph.fold?.members.get(id) ?? [id]);
                    if (ids.length)
                        onSelect(ids, true);
                }
                return;
            }
            const hit = hitAt(e.clientX, e.clientY);
            const additive = isAdditive(e);
            if (!hit)
                return additive ? undefined : onClear();
            const band = hit.kind === "band" ? hit.id : foldKeyOf(hit.id);
            if (band !== undefined) {
                if (onToggleFold && !additive && isSecondClickOn(band)) {
                    anchorRef.current = band;
                    return onToggleFold(band, hit.kind === "band");
                }
                if (!additive)
                    return onSelect(`group:${band}`, false);
                const ids = bandSelection(band);
                if (!ids.length)
                    return additive ? undefined : onClear();
                return onSelect(ids, additive);
            }
            onSelect(unfold(hit.id), additive);
        }} onPointerCancel={(e) => {
            dropPointer(e.pointerId);
            endPress();
            dragRef.current = null;
            setLasso(null);
        }} onPointerLeave={(e) => {
            dropPointer(e.pointerId);
            endPress();
            dragRef.current = null;
            setLasso(null);
            endHover();
        }}>
        
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="5" markerHeight="5" markerUnits="strokeWidth" orient="auto">
            <path d="M0,0.6 L8,4 L0,7.4 Z" fill="context-stroke"/>
          </marker>
        </defs>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          
          <GroupBands graph={graph} bands={layout.bands} familyBands={layout.familyBands ?? []} visible={visible} selection={selection} onSelect={onSelect} onToggleFold={onToggleFold ? (key, collapsed) => { endHover(); anchorRef.current = key; onToggleFold(key, collapsed); } : undefined}/>

          
          {columnHeaders.map(({ name, label }, col) => (<ColumnHeader key={name} label={label} col={col} count={columnHeaders.length} x={layout.columnX[col]!} onMove={onArrange ? (to) => arrange(col, to) : undefined}/>))}

          {graph.index.edges.flatMap((edge) => {
            const id = edgeId(edge.from, edge.to);
            const segments = layout.edges.get(id);
            if (!segments)
                return [];
            const ends = [tierOf(edge.from), tierOf(edge.to)];
            const currentEdge = tour?.currentEdges?.has(id) ?? (tour && tour.current.has(edge.to) && (tour.current.has(edge.from) || tour.established.has(edge.from)));
            const defaultTier = ends.includes("cold")
                ? "cold"
                : ends.includes("far")
                    ? "far"
                    : ends.includes("mid")
                        ? "mid"
                        : "near";
            if (tour?.limit && (tierOf(edge.from) === "cold" || tierOf(edge.to) === "cold"))
                return [];
            const documented = id in graph.index.edgeDocs;
            const against = runsAgainstOrder(graph, edge);
            const gathered = graph.fold?.edges.get(id)?.length ?? 1;
            const bundle = gathered >= 4 ? "bundle many" : gathered >= 2 ? "bundle" : "";
            return segments.map((geometry, si) => {
                const tier = currentEdge && (!geometry.gateId || !tour?.currentGates || tour.currentGates.has(geometry.gateId)) ? "now" : defaultTier;
                return (<path key={`${id}#${si}`} data-id={id} data-gate={geometry.gateId} class={`edge ${against ? "against" : ""} ${documented ? "documented" : ""} ${bundle} ${story?.edges.has(id) ? "instory" : ""} ${selection.includes(id)
                        ? "sel"
                        : tier === "cold"
                            ? "cold"
                            : graded
                                ? tier
                                : ""}`} marker-end={!intoGate.has(id) &&
                        (against || selection.includes(id) || (graded && (tier === "near" || tier === "now")))
                        ? "url(#arrow)"
                        : undefined} d={edgePath(geometry)}/>);
            });
        })}

          
          {layout.gates.map((gate) => {
            if (tour?.limit && tierOf(gate.gatedId) === "cold")
                return null;
            const ends = [tierOf(gate.gatedId), ...gate.edgeIds.map(edgeTier)];
            const tier = tour?.currentGates?.has(gate.id) ? "now" : TIERS.find((t) => ends.includes(t)) ?? "near";
            const picked = selection.includes(gate.id);
            return (<g key={gate.id} data-id={gate.id} class={`gate ${gate.partial ? "partial" : ""} ${picked ? "sel" : tier === "cold" ? "cold" : graded ? tier : ""}`}>
                <path class="gatestem" d={edgePath(gate.stem)} marker-end={picked || (graded && (tier === "near" || tier === "now")) ? "url(#arrow)" : undefined}/>
                <path class="gatebody" d={gatePath(gate)}/>
                
                {gate.openY.map((y) => (<circle key={y} class="gateopen" cx={gate.x} cy={y} r={GATE_OPEN_R}/>))}
              </g>);
        })}

          {graph.index.nodes.map((node) => {
            if (tour?.limit && tierOf(node.id) === "cold")
                return null;
            const pos = layout.positions.get(node.id);
            if (!pos)
                return null;
            const tier = tierOf(node.id);
            const selected = tier === "sel";
            const hue = graph.hueOf.get(node.layer) ?? "--s1";
            const { lines } = pos;
            const presentation = nodePresentation?.get(node.id);
            if (node.fold) {
                return (<g key={node.id} data-id={node.id} role="button" tabIndex={0} aria-label={`${node.label}. ${node.fold.summary}. Open group details`} onKeyDown={e => {
                        if (e.key !== "Enter" && e.key !== " ")
                            return;
                        e.preventDefault();
                        e.stopPropagation();
                        const additive = isAdditive(e);
                        onSelect(additive ? bandSelection(node.fold!.key) : `group:${node.fold!.key}`, additive);
                    }} class={`node fold ${tier === "cold" || graded ? tier : ""} ${selected ? "sel" : ""} ${story?.nodes.has(node.id) ? "instory" : ""} ${held.has(node.id) ? "held" : ""} ${hits.has(node.id) ? "hit" : ""}`} transform={`translate(${pos.x},${pos.y})`}>
                  {hits.has(node.id) && (<rect class="hitring" x={-HIT_HALO} y={-HIT_HALO} width={NODE_W + HIT_HALO * 2} height={pos.h + HIT_HALO * 2} rx={7 + HIT_HALO}/>)}
                  <rect class="foldback" style={{ "--fold-hue": `var(${hue})` }} x={4} y={4} width={NODE_W} height={pos.h} rx={10}/>
                  <rect class="box foldbox" width={NODE_W} height={pos.h} rx={10}>
                    <title>{`${node.label} — click for details; double-click to open the band`}</title>
                  </rect>
                  {lines.map((line, i) => (<text key={i} class="bandhdr" x={NODE_PAD_X} y={HEADER_Y + i * LABEL_LINE_H}>
                      {line}
                    </text>))}
                  <text class="foldsum" x={NODE_PAD_X} y={32 + (lines.length - 1) * LABEL_LINE_H}>
                    {node.fold.summary}
                  </text>
                  {onToggleFold && <foreignObject x={NODE_W - 32} y={pos.h - 27} width={28} height={24}>
                    <button type="button" data-walkthrough={node.layer === "affordance" ? "map-expand-group" : undefined} aria-label={`Expand ${node.label}`} title={`Expand ${node.label}`} style={{ width: "100%", height: "100%", padding: 0, fontSize: "16px", lineHeight: 1 }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); endHover(); anchorRef.current = node.fold!.key; onToggleFold(node.fold!.key, false); }}>+</button>
                  </foreignObject>}
                </g>);
            }
            return (<g key={node.id} data-id={node.id} data-walkthrough={tour ? tour.current.has(node.id) ? "case-node" : undefined : "map-node"} role="button" tabIndex={0} aria-label={[presentation?.label ?? node.label, presentation?.subtitle, presentation?.label ? node.label : undefined].filter(Boolean).join(". ")} onKeyDown={e => {
                    if (e.key !== "Enter" && e.key !== " ")
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(node.id, isAdditive(e));
                }} class={`node ${tier === "cold" || graded ? tier : ""} ${selected ? "sel" : ""} ${story?.nodes.has(node.id) ? "instory" : ""} ${held.has(node.id) ? "held" : ""} ${hits.has(node.id) ? "hit" : ""}`} transform={`translate(${pos.x},${pos.y})`}>
                
                {hits.has(node.id) && (<rect class="hitring" x={-HIT_HALO} y={-HIT_HALO} width={NODE_W + HIT_HALO * 2} height={pos.h + HIT_HALO * 2} rx={7 + HIT_HALO}/>)}
                <rect class="box" width={NODE_W} height={pos.h} fill={`color-mix(in srgb, var(${hue}) 14%, var(--surface-1))`}/>
                <title>{node.label}</title>

                

                {lines.map((line, i) => (<text key={i} x={NODE_PAD_X} y={LABEL_Y + i * LABEL_LINE_H}>
                    {line}
                  </text>))}
                {presentation?.subtitle && <g class="node-detail">
                  <rect x={NODE_PAD_X - 3} y={LABEL_Y + (lines.length - 1) * LABEL_LINE_H + 7} width={NODE_W - 2 * NODE_PAD_X + 6} height={LABEL_LINE_H + 5} rx={3}/>
                  <text x={NODE_PAD_X + 3} y={LABEL_Y + lines.length * LABEL_LINE_H + 7}>{wrapText(presentation.subtitle, LABEL_CHARS, 1)[0]}</text>
                  <title>{presentation.subtitle}</title>
                </g>}
              </g>);
        })}

          
          {tour?.actors.map(({ actor, node }, i, actors) => {
            const pos = layout.positions.get(node);
            const n = graph.byId.get(node);
            if (!pos || !n)
                return null;
            const slot = actors.slice(0, i).filter(a => a.node === node).length;
            return <g key={actor.id} class={`case-actor ${actor.kind}`} data-actor={actor.id} role="img" aria-label={actor.label} style={{ transform: `translate(${pos.x + NODE_W - 16 - slot * 34}px, ${pos.y - 10}px) scale(1.6)` }} onPointerMove={e => { e.stopPropagation(); onHover({ kind: "node", node: { ...n, label: actor.label, lead: `Placed at ${n.label}. Positions carry forward until the next placement.` }, x: e.clientX, y: e.clientY }); }} onPointerLeave={() => onHover(null)}>
              <title>{actor.label}</title><circle r={10}/>
              {actor.kind === "ai" ? <><rect x={-5} y={-4} width={10} height={8} rx={1}/><path d="M-3 -1h1 M2 -1h1 M0 -4v-3"/></> : actor.kind === "human" ? <><circle cy={-3} r={2.5}/><path d="M-5 5q0 -7 5 -7t5 7"/></> : <><circle cx={-3} cy={-2} r={2}/><circle cx={3} cy={-2} r={2}/><path d="M-7 5q1 -5 4 -5t4 5 M0 5q1 -5 4 -5t4 5"/></>}
            </g>;
        })}
          {lasso && (<rect class="lasso" x={Math.min(lasso.ax, lasso.bx)} y={Math.min(lasso.ay, lasso.by)} width={Math.abs(lasso.bx - lasso.ax)} height={Math.abs(lasso.by - lasso.ay)} vector-effect="non-scaling-stroke"/>)}
        </g>
      </svg>

      
      <div class="canvasview" ref={viewRef}>
        <div class="zoomctl">
          <button onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">
            +
          </button>
          <button onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out">
            −
          </button>
          <button class="small" data-walkthrough="map-fit" onClick={fit} title="Fit to window" aria-label="Fit to window">
            fit
          </button>
        </div>

        {children}

        <ScrollIndicators layout={layout} transform={transform} viewport={viewport} onPan={(axis, offset) => setTransform((t) => (axis === "h" ? { ...t, x: offset } : { ...t, y: offset }))}/>
      </div>
    </div>);
}
function ColumnHeader({ label, col, count, x, onMove, }: {
    label: string;
    col: number;
    count: number;
    x: number;
    onMove?: (to: number) => void;
}) {
    const box = columnHeaderBox(x, label);
    return (<g class="colhdr" role="group" tabindex={onMove ? 0 : undefined} aria-label={`${label} column, ${col + 1} of ${count}.${onMove ? " Use the arrow keys to move it." : ""}`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => {
            if (!onMove)
                return;
            const to = e.key === "ArrowLeft" ? col - 1 : e.key === "ArrowRight" ? col + 1 : null;
            if (to === null)
                return;
            e.preventDefault();
            e.stopPropagation();
            onMove?.(to);
        }}>
      <rect class="colhdrbox" x={box.x} y={box.y} width={box.w} height={box.h} rx={7}/>
      <text x={columnCentreX(x)} y={COLUMN_HEADER_Y} text-anchor="middle" class="colhdrtext" font-size={COLUMN_HEADER_SIZE}>
        {label}
      </text>
      
      {onMove && ([-1, 1] as const)
            .filter((dir) => col + dir >= 0 && col + dir < count)
            .map((dir) => (<ColumnArrow key={dir} dir={dir} x={columnArrowX(x, label, dir)} label={`Move the ${label} column ${dir < 0 ? "left" : "right"}`} onPress={() => onMove(col + dir)}/>))}
    </g>);
}
function ColumnArrow({ dir, x, label, onPress, }: {
    dir: -1 | 1;
    x: number;
    label: string;
    onPress: () => void;
}) {
    const r = COLUMN_ARROW_R;
    const y = COLUMN_ARROW_Y;
    const tip = x + dir * r * 0.34;
    const back = x - dir * r * 0.22;
    return (<g class="colarrow" role="button" tabindex={-1} aria-label={label} onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary)
                return;
            e.stopPropagation();
        }} onClick={(e) => {
            e.stopPropagation();
            (e.currentTarget as SVGGElement).focus?.({ preventScroll: true });
            onPress();
        }}>
      <circle class="colarrowdisc" cx={x} cy={y} r={r}/>
      <path class="colarrowmark" d={`M${back},${y - r * 0.42} L${tip},${y} L${back},${y + r * 0.42}`}/>
    </g>);
}
function GroupBands({ graph, bands, familyBands, visible, selection, onSelect, onToggleFold, }: {
    graph: GraphModel;
    bands: Band[];
    familyBands: Band[];
    visible: Set<string>;
    selection: string[];
    onSelect: Props["onSelect"];
    onToggleFold?: Props["onToggleFold"];
}) {
    const tax = graph.index.taxonomies;
    return (<g class="bands">
      {[...familyBands, ...bands].map((band) => {
            const parent = familyBands.includes(band);
            const live = band.ids.some((id) => visible.has(id));
            const shown = band.ids.filter((id) => visible.has(id)).flatMap(id => graph.fold?.members.get(id) ?? [id]);
            const held = selection.includes(`group:${band.group}`) ||
                (shown.length > 0 && shown.every((id) => selection.includes(id)));
            const group = bandDetailOf(graph, `group:${band.group}`);
            const label = group?.label ?? tax.phase?.values[band.group]?.label ?? band.group;
            const originalGroup = graph.index.groups.find(g => g.id === band.group);
            const heading = group ? (originalGroup?.short ?? label) : `${band.group} · ${label}`;
            const member = graph.byId.get(band.ids[0]!);
            const kind = member
                ? `${graph.index.layers.find((l) => l.name === member.layer)?.label ?? member.layer}s`.toLowerCase()
                : "nodes";
            return (<g key={band.group} data-id={band.group} role="button" tabIndex={0} aria-label={`${label}. Open group details`} onKeyDown={e => {
                    if (e.key !== "Enter" && e.key !== " ")
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(isAdditive(e) ? shown : `group:${band.group}`, isAdditive(e));
                }} class={`band ${parent ? "family-band" : ""} ${live ? "" : "cold"} ${held ? "sel" : ""}`}>
            <rect class="bandbox" x={band.x} y={band.y} width={band.width} height={band.height} rx={10} style={parent ? { fill: "color-mix(in srgb, var(--s6) 5%, var(--surface-1))", stroke: "color-mix(in srgb, var(--s6) 22%, var(--axis))" } : undefined}>
              <title>{`${label} — click for details; Shift-click to select ${shown.length} ${kind}`}</title>
            </rect>
            {wrapText(heading, FOLD_LABEL_CHARS, parent ? 2 : 1).map((line, i) => <text key={i} class="bandhdr" x={band.x + 12} y={band.y + BAND_LABEL_DY + i * LABEL_LINE_H}>{line}</text>)}
            {onToggleFold && <foreignObject x={band.x + band.width - 36} y={band.y + (parent ? 7 : 0)} width={28} height={24}>
              <button type="button" aria-label={`Collapse ${label}`} title={`Collapse ${label}`} style={{ width: "100%", height: "100%", padding: 0, fontSize: "16px", lineHeight: 1, pointerEvents: "auto" }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onToggleFold(band.group, true); }}>−</button>
            </foreignObject>}
          </g>);
        })}
    </g>);
}
function ScrollIndicators({ layout, transform, viewport, onPan, }: {
    layout: LayoutResult;
    transform: Transform;
    viewport: {
        width: number;
        height: number;
    };
    onPan: (axis: "h" | "v", offset: number) => void;
}) {
    const contentW = layout.width * transform.k;
    const contentH = layout.height * transform.k;
    if (contentW <= viewport.width && contentH <= viewport.height)
        return null;
    return (<>
      {contentW > viewport.width && (<ScrollBar axis="h" content={contentW} size={viewport.width} offset={transform.x} onPan={(offset) => onPan("h", offset)}/>)}
      {contentH > viewport.height && (<ScrollBar axis="v" content={contentH} size={viewport.height} offset={transform.y} onPan={(offset) => onPan("v", offset)}/>)}
    </>);
}
const SCROLL_STEP_PX = 60;
const WHEEL_LINE_PX = 16;
function ScrollBar({ axis, content, size, offset, onPan, }: {
    axis: "h" | "v";
    content: number;
    size: number;
    offset: number;
    onPan: (offset: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        pointerId: number;
        origin: number;
        offset: number;
    } | null>(null);
    const ratio = Math.min(1, size / content);
    const maxScroll = Math.max(1, content - size);
    const scrolled = Math.min(1, Math.max(0, -offset / maxScroll));
    const clamp = (next: number) => Math.min(0, Math.max(-maxScroll, next));
    const live = useRef({ offset, maxScroll, size, onPan });
    live.current = { offset, maxScroll, size, onPan };
    useEffect(() => {
        const track = trackRef.current;
        if (!track)
            return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const s = live.current;
            const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? s.size : 1;
            const delta = axis === "h" ? e.deltaX || e.deltaY : e.deltaY;
            if (!delta)
                return;
            const next = s.offset - delta * unit;
            s.onPan(Math.min(0, Math.max(-s.maxScroll, next)));
        };
        track.addEventListener("wheel", onWheel, { passive: false });
        return () => track.removeEventListener("wheel", onWheel);
    }, [axis]);
    const along = (e: {
        clientX: number;
        clientY: number;
    }, rect: DOMRect) => axis === "h" ? e.clientX - rect.left : e.clientY - rect.top;
    const lengthOf = (rect: DOMRect) => (axis === "h" ? rect.width : rect.height);
    const scale = (rect: DOMRect) => {
        const travel = lengthOf(rect) * (1 - ratio);
        return travel > 0 ? maxScroll / travel : 0;
    };
    return (<div ref={trackRef} class={`scrollbar ${axis}`} role="scrollbar" aria-controls="graph-canvas" aria-orientation={axis === "h" ? "horizontal" : "vertical"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(scrolled * 100)} aria-label={axis === "h" ? "Pan horizontally" : "Pan vertically"} tabIndex={0} onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary)
                return;
            const rect = trackRef.current?.getBoundingClientRect();
            if (!rect)
                return;
            e.preventDefault();
            const pos = along(e, rect);
            const length = lengthOf(rect);
            const thumbStart = scrolled * length * (1 - ratio);
            const onThumb = pos >= thumbStart && pos <= thumbStart + length * ratio;
            const start = onThumb ? offset : clamp(-(pos - (length * ratio) / 2) * scale(rect));
            if (!onThumb)
                onPan(start);
            dragRef.current = { pointerId: e.pointerId, origin: pos, offset: start };
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        }} onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d || d.pointerId !== e.pointerId)
                return;
            const rect = trackRef.current?.getBoundingClientRect();
            if (!rect)
                return;
            onPan(clamp(d.offset - (along(e, rect) - d.origin) * scale(rect)));
        }} onPointerUp={() => {
            dragRef.current = null;
        }} onPointerCancel={() => {
            dragRef.current = null;
        }} onKeyDown={(e) => {
            const back = axis === "h" ? "ArrowLeft" : "ArrowUp";
            const forward = axis === "h" ? "ArrowRight" : "ArrowDown";
            const step = e.key === back
                ? SCROLL_STEP_PX
                : e.key === forward
                    ? -SCROLL_STEP_PX
                    : e.key === "PageUp"
                        ? size * 0.9
                        : e.key === "PageDown"
                            ? -size * 0.9
                            : null;
            if (step !== null) {
                e.preventDefault();
                return onPan(clamp(offset + step));
            }
            if (e.key === "Home") {
                e.preventDefault();
                return onPan(0);
            }
            if (e.key === "End") {
                e.preventDefault();
                return onPan(-maxScroll);
            }
        }}>
      <div class="thumb" style={axis === "h"
            ? { width: `${ratio * 100}%`, left: `${scrolled * (100 - ratio * 100)}%` }
            : { height: `${ratio * 100}%`, top: `${scrolled * (100 - ratio * 100)}%` }}/>
    </div>);
}
