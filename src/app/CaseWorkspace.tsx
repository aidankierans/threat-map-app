import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { GraphIndex, ProseBundle } from "../types.js";
import type { ReaderState } from "./reader-state.js";
import { bandDetailOf, buildGraph, groupKeyOf } from "./selectors.js";
import { conditionFamily } from "./display-groups.js";
import { bandsOf, foldGraph, foldedKeys, foldedSet } from "./fold.js";
import { draftDocument, type CaseAction } from "./case-edit.js";
import { capturedStory, defaultPresentation } from "./case-derive.js";
import { tourStateAt } from "./tour.js";
import { GraphCanvas, type HoverTarget } from "./Graph.js";
import { Timeline } from "./Timeline.js";
import { CasePanel } from "./CasePanel.js";
import { CaseNodeDetails } from "./CaseNodeDetails.js";
import { HoverCard } from "./HoverCard.js";
import { edgeId } from "../edge-id.js";
import { gateId } from "../gate-id.js";
import { resolveRequirement } from "./case-codec.js";
interface Props {
    toolbarStart?: ComponentChildren;
    actions?: ComponentChildren;
    index: GraphIndex;
    prose: ProseBundle | null;
    reader: ReaderState;
    dispatch: (a: CaseAction) => void;
    step: number;
    onStep: (n: number) => void;
    onLeave: () => void;
    saved: boolean;
}
export function CaseWorkspace({ toolbarStart, actions, index, prose, reader, dispatch, step: requested, onStep: advance, onLeave, saved }: Props) {
    const doc = useMemo(() => draftDocument(reader), [reader]);
    const graph = useMemo(() => buildGraph(index, doc.content.view.columns), [index, doc.content.view.columns]);
    const [editing, setEditing] = useState(false);
    const [limit, setLimit] = useState(true);
    const [actorsVisible, setActorsVisible] = useState(false);
    const [timelineVisible, setTimelineVisible] = useState(true);
    const [detail, setDetail] = useState<string | null>(null);
    const [detailChoices, setDetailChoices] = useState<string[]>([]);
    const columns = useRef<HTMLDivElement>(null);
    const returnPosition = useRef<{
        panel: number;
        columns: number;
        focus: HTMLElement | SVGElement | null;
    } | null>(null);
    const rememberPosition = () => {
        if (returnPosition.current)
            return;
        returnPosition.current = {
            panel: columns.current?.querySelector(".case-panel")?.scrollTop ?? 0,
            columns: columns.current?.scrollTop ?? 0,
            focus: document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null,
        };
    };
    const openDetails = (id: string) => {
        rememberPosition();
        setPlaying(false);
        setHover(null);
        setDetailChoices([]);
        setDetail(id);
    };
    const closeDetails = useCallback(() => setDetail(null), []);
    useLayoutEffect(() => {
        if (detail || detailChoices.length || !returnPosition.current)
            return;
        const saved = returnPosition.current;
        const panel = columns.current?.querySelector(".case-panel");
        if (panel)
            panel.scrollTop = saved.panel;
        if (columns.current)
            columns.current.scrollTop = saved.columns;
        saved.focus?.focus({ preventScroll: true });
        returnPosition.current = null;
    }, [detail, detailChoices.length]);
    useLayoutEffect(() => {
        if (detailChoices.length)
            columns.current?.querySelector<HTMLButtonElement>(".case-node-choices button")?.focus();
    }, [detailChoices]);
    const [pick, setPick] = useState<{
        step: string;
        actor?: string;
    } | null>(null);
    const [hover, setHover] = useState<HoverTarget | null>(null);
    const [inspect, setInspect] = useState<string | null>(null);
    const [fold, setFold] = useState(doc.content.view.filters.fold);
    const [focusTarget, setFocusTarget] = useState<{
        id: string;
        sequence: number;
    } | {
        ids: string[];
        sequence: number;
    } | null>(null);
    const [focusCurrentStep, setFocusCurrentStep] = useState(false);
    const step = Math.max(0, Math.min(doc.content.presentation.steps.length - 1, requested));
    const [playing, setPlaying] = useState(false);
    const lastStep = doc.content.presentation.steps.length - 1;
    const onStep = useCallback((next: number) => {
        setPlaying(false);
        setDetail(null);
        setDetailChoices([]);
        setInspect(null);
        setFocusTarget(null);
        advance(Math.max(0, Math.min(lastStep, next)));
    }, [advance, lastStep]);
    useLayoutEffect(() => {
        if (!playing)
            return;
        if (editing || step >= lastStep) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(() => advance(step + 1), 4500);
        return () => clearTimeout(timer);
    }, [playing, editing, step, lastStep, advance]);
    const tour = useMemo(() => tourStateAt(doc, step, { limit }), [doc, step, limit]);
    useLayoutEffect(() => {
        if (!focusCurrentStep)
            return;
        if (window.innerWidth <= 700 && columns.current)
            columns.current.scrollTop = 0;
        setFocusTarget(previous => tour.current.size ? { ids: [...tour.current], sequence: (previous?.sequence ?? 0) + 1 } : null);
    }, [focusCurrentStep, tour.current]);
    const storyNodes = useMemo(() => new Set(doc.content.stories.flatMap(s => s.occurrences.map(o => o.node))), [doc.content.stories]);
    const view = useMemo(() => limit ? buildGraph(index, doc.content.view.columns, n => storyNodes.has(n.id)) : graph, [limit, graph, index, storyNodes, doc.content.view.columns]);
    const canvas = useMemo(() => foldGraph(view, foldedKeys(view, fold, bandsOf(view, focusTarget ? "ids" in focusTarget ? focusTarget.ids : [focusTarget.id] : [])), doc.content.view.columns), [view, fold, focusTarget, doc.content.view.columns]);
    const showOnMap = (id: string) => {
        if (!graph.byId.has(id))
            return;
        setPlaying(false);
        if (!storyNodes.has(id))
            setLimit(false);
        setInspect(id);
        setFocusTarget(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }));
    };
    const currentEdges = new Set<string>();
    const currentGates = new Set<string>();
    for (const story of doc.content.stories)
        for (const occurrence of story.occurrences) {
            if (!tour.current.has(occurrence.node) || occurrence.argument.kind !== "requirement")
                continue;
            for (const member of occurrence.argument.members)
                currentEdges.add(edgeId(member.declared, occurrence.node));
            const resolved = resolveRequirement(graph.index, occurrence.argument.ref);
            if (resolved.status === "resolved")
                currentGates.add(gateId(occurrence.node, resolved.group));
        }
    const canvasTour = { ...tour, currentEdges: foldedSet(canvas.fold, currentEdges), currentGates: foldedSet(canvas.fold, currentGates), current: foldedSet(canvas.fold, tour.current), established: foldedSet(canvas.fold, tour.established), later: foldedSet(canvas.fold, tour.later), actors: tour.actors.map(a => ({ ...a, node: canvas.fold?.of.get(a.node) ?? a.node })) };
    const nodePresentation = useMemo(() => {
        const presentation = new Map<string, {
            label?: string;
            subtitle?: string;
        }>();
        const active = new Set(doc.content.presentation.steps[step].occurrences.map(r => JSON.stringify([r.story, r.occurrence])));
        const occurrences = doc.content.stories.flatMap(s => s.occurrences.map(o => ({ occurrence: o, active: active.has(JSON.stringify([s.id, o.id])) })));
        for (const { occurrence } of [...occurrences.filter(o => !o.active), ...occurrences.filter(o => o.active)]) {
            const id = canvas.fold?.of.get(occurrence.node) ?? occurrence.node;
            if (id !== occurrence.node || !occurrence.presentation)
                continue;
            presentation.set(id, { label: occurrence.presentation.label, subtitle: occurrence.presentation.subtitle });
        }
        return presentation;
    }, [doc, canvas.fold, step]);
    const focusStep = () => {
        if (!focusCurrentStep && window.innerWidth <= 700)
            setTimelineVisible(false);
        setFocusCurrentStep(value => !value);
    };
    const toggleGroup = (key: string, collapsed?: boolean) => {
        setFocusTarget(null);
        setFold(f => {
            if (collapsed === undefined)
                return { ...f, except: f.except.includes(key) ? f.except.filter(k => k !== key) : [...f.except, key] };
            const children = bandDetailOf(graph, `group:${key}`)?.children?.map(child => child.id) ?? [];
            const except = f.except.filter(k => k !== key && !(collapsed && children.includes(k)) && !(!collapsed && !f.all && k === conditionFamily(key)));
            if (f.all !== collapsed)
                except.push(key);
            return { ...f, except };
        });
    };
    const derived = useMemo(() => editing ? doc.content.stories.flatMap(s => defaultPresentation(graph, capturedStory(graph, s), s).steps) : [], [editing, graph, doc.content.stories]);
    useLayoutEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true]"))
                return;
            if (e.key === "Escape") {
                e.preventDefault();
                if (detail)
                    closeDetails();
                else if (detailChoices.length)
                    setDetailChoices([]);
                else
                    onLeave();
            }
            if (detail || detailChoices.length)
                return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onStep(Math.max(0, Math.min(doc.content.presentation.steps.length - 1, step + (e.key === "ArrowRight" ? 1 : -1))));
            }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [step, onStep, onLeave, doc.content.presentation.steps.length, detail, detailChoices.length, closeDetails]);
    const membersFor = (id: string) => canvas.fold?.members.get(id) ?? (id.startsWith("fold:") ? [...view.byId.values()].filter(node => groupKeyOf(node) === id.slice(5)).map(node => node.id) : [id]);
    const picked = (ids: string | string[]) => {
        const selected = (typeof ids === "string" ? [ids] : ids).map(id => id.startsWith("group:") ? `fold:${id.slice(6)}` : id);
        const id = selected[0];
        const nodes = [...new Set(selected.flatMap(membersFor))];
        const matches = doc.content.stories.flatMap(s => s.occurrences.filter(o => nodes.includes(o.node)).map(o => ({ story: s.id, occurrence: o.id })));
        if (pick && matches.length === 1) {
            dispatch(pick.actor ? { type: "place", step: pick.step, actor: pick.actor, at: matches[0] } : { type: "assign", step: pick.step, ref: matches[0] });
            setPick(null);
        }
        else if (pick) {
            setInspect(id);
        }
        else {
            setInspect(id);
            setPlaying(false);
            const available = nodes.filter(id => graph.byId.has(id));
            if (available.length === 1)
                openDetails(available[0]);
            else if (available.length > 1) {
                rememberPosition();
                setDetail(null);
                setDetailChoices(available);
            }
        }
    };
    return <div class="case-workspace">
    <div class="case-toolbar">{toolbarStart}<button data-walkthrough="case-leave" onClick={onLeave}>Leave case study</button><button aria-pressed={editing} onClick={() => { setEditing(!editing); setPick(null); }}>{editing ? "Exit editing mode" : "Enter editing mode"}</button>
      <button aria-expanded={timelineVisible} aria-controls="case-timeline" onClick={() => setTimelineVisible(!timelineVisible)}>{timelineVisible ? "Hide timeline" : "Show timeline"}</button>
      {editing && <><button disabled={!reader.undo.length} onClick={() => dispatch({ type: "undo" })}>Undo</button><button disabled={!reader.redo.length} onClick={() => dispatch({ type: "redo" })}>Redo</button></>}
      <span role="status">{saved ? "Draft saved in this browser" : "Not saved in this browser — use Export file to keep your work"}</span>
      {actions}
    </div>
    {editing && actorsVisible && <section id="case-actors" class="case-details" aria-label="Actors">
      <h3>Actors on the map</h3>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const label = String(data.get("label") ?? "").trim(); if (label) {
            dispatch({ type: "actor-add", actor: { id: crypto.randomUUID(), label, kind: data.get("kind") as "ai" | "human" | "population" } });
            e.currentTarget.reset();
        } }}><input name="label" aria-label="Actor name" required/><select name="kind" aria-label="Actor kind"><option value="ai">AI</option><option value="human">Human</option><option value="population">Population</option></select><button>Add actor</button></form>
      {doc.content.actors.map(a => {
                const inUse = doc.content.context.scopes.some(s => s.actor === a.id) || doc.content.archivedStories.some(story => story.context.scopes.some(s => s.actor === a.id));
                return <p key={a.id}>{a.label} <button disabled={inUse} title={inUse ? "This actor identifies claims in the case and cannot be removed while those claims use it." : `Remove ${a.label}`} onClick={() => dispatch({ type: "actor-remove", actor: a.id })}>Remove actor</button>{inUse && <small> Used by case claims</small>}</p>;
            })}
    </section>}
    {pick && <div class="case-pick" role="status">{pick.actor ? "Click a claim to place this actor." : "Click a claim to assign it to the armed step."} <button onClick={() => setPick(null)}>Cancel picking</button></div>}
    {pick && inspect && <div class="case-pick"><strong>{graph.byId.get(inspect)?.label ?? inspect}</strong><p>{graph.byId.get(inspect)?.lead}</p>
      {pick && <p>Choose the specific claim; a folded box or repeated claim cannot determine it.</p>}
      {pick && doc.content.stories.flatMap(s => s.occurrences.filter(o => membersFor(inspect).includes(o.node)).map(o => <button onClick={() => { const at = { story: s.id, occurrence: o.id }; dispatch(pick.actor ? { type: "place", step: pick.step, actor: pick.actor, at } : { type: "assign", step: pick.step, ref: at }); setPick(null); setInspect(null); }}>{s.title}: {graph.byId.get(o.node)?.label ?? o.node} ({o.scope})</button>))}
      <button onClick={() => setInspect(null)}>Close detail</button></div>}
    <div class="case-columns" ref={columns}>
      <div class="case-playback" role="group" aria-label="Walkthrough playback">
        {editing && <button aria-controls="case-actors" aria-expanded={actorsVisible} onClick={() => setActorsVisible(!actorsVisible)}>Actors</button>}
        <div class="case-playback-buttons">
          <button aria-label="Previous step" title="Previous step (Left arrow)" disabled={step === 0} onClick={() => onStep(step - 1)}>←</button>
          <button disabled={editing || !!detail || lastStep === 0} onClick={() => { if (!playing && step === lastStep)
        advance(0); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</button>
          <button data-walkthrough="case-next" aria-label="Next step" title="Next step (Right arrow)" disabled={step === lastStep} onClick={() => onStep(step + 1)}>→</button>
        </div>
        <span aria-live="polite" style={{ width: `${10 + 2 * String(lastStep + 1).length}ch` }}>Step {step + 1} of {lastStep + 1}</span>
        <button data-walkthrough="case-focus" aria-pressed={focusCurrentStep} disabled={!focusCurrentStep && !tour.current.size} onClick={focusStep}>Focus current step</button>
      </div>
      {timelineVisible && <Timeline document={doc} active={step} editing={editing} onStep={onStep} dispatch={dispatch} pick={pick?.step ?? null} onPick={(step, actor) => { setInspect(null); setPick(step ? { step, actor } : null); }} derived={derived}/>}
      <GraphCanvas graph={canvas} visible={canvas.drawn} hits={new Set()} held={new Set()} selection={inspect ? [canvas.fold?.of.get(inspect) ?? inspect] : []} focusTarget={focusTarget} nodePresentation={nodePresentation} onSelect={picked} onClear={() => { setInspect(null); setFocusTarget(null); }} onHover={setHover} partialGates tour={canvasTour} onToggleFold={toggleGroup}/>
      <CasePanel hidden={!!detail || detailChoices.length > 0} document={doc} graph={graph} prose={prose} active={step} editing={editing} limit={limit} onLimit={setLimit} onStep={onStep} dispatch={dispatch} onSelect={showOnMap} onViewDetails={openDetails}/>
      {detail && <CaseNodeDetails key={detail} id={detail} graph={graph} prose={prose} onCanvas={view.drawn} onBack={closeDetails}/>}
      {detailChoices.length > 0 && <section class="case-node-details case-node-choices" aria-label="Choose a node to inspect"><button data-walkthrough="case-back" onClick={() => setDetailChoices([])}>Back to case study</button><h3>Choose a node in this group</h3>{detailChoices.map(id => <button key={id} onClick={() => openDetails(id)}>{graph.byId.get(id)?.label ?? id}</button>)}</section>}
    </div>
    <HoverCard content={hover?.kind === "node" ? { kicker: "Case study", title: hover.node.label, body: hover.node.lead } : null} x={hover?.x ?? 0} y={hover?.y ?? 0}/>
  </div>;
}
