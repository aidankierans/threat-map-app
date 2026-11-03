import profile from "@threat-map/data/profile.json";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { dismissWalkthroughInvitation } from "./walkthrough-state.js";
import { guideArrow } from "./walkthrough-geometry.js";
import "../styles/walkthrough.css";
export { shouldInviteWalkthrough, dismissWalkthroughInvitation, requestWalkthrough, WALKTHROUGH_REQUEST_EVENT } from "./walkthrough-state.js";
export interface WalkthroughProps {
    open: boolean;
    onExit: (completed: boolean) => void;
    onOpenMap: (phase: "entry" | "map") => void | Promise<void>;
    /** Records the app's state when a step begins; Back restores it, undoing that step's actions. */
    capture?: () => unknown;
    restore?: (state: unknown) => void;
    /** Adds the steps for editing a local copy of the map. */
    mapEditing?: boolean;
}
interface Step {
    chapter: "entry" | "case" | "map";
    target: string;
    title: string;
    body: string;
    action?: string;
    required?: boolean;
}
const BASE_STEPS: Step[] = [
    { chapter: "entry", target: "case-menu", title: "Open the case-study menu", body: "Case studies are available from this button on both the map and the case-study screen. Open the menu to choose an example.", action: "Select Case studies.", required: true },
    { chapter: "entry", target: `case-example-${profile.tutorialCase}`, title: "Choose the introductory example", body: "Choose the introductory example to follow a short sequence from an evaluation task to an external consequence. Your previous view and draft will be restored when you exit.", action: "Select the highlighted case study.", required: true },
    { chapter: "case", target: "case-timeline", title: "Start with one case study", body: "This example follows a sequence through the map. Read its steps in order using the timeline." },
    { chapter: "case", target: "case-next", title: "Move through the steps", body: "Next step advances through this example. The canvas highlights the selected step's nodes and connections, and the detail panel explains its claims.", action: "Select Next step to see the next part of this example." },
    { chapter: "case", target: "case-focus", title: "Find the current step on the map", body: "Focus current step keeps the selected step's nodes in view as you move between steps. Select it again to turn off automatic focusing.", action: "Select Focus current step.", required: true },
    { chapter: "case", target: "case-node", title: "Inspect a node on the canvas", body: "Select the highlighted node directly on the canvas to read its description, assumptions and sources. Its details open within this case study.", action: "Select the highlighted node.", required: true },
    { chapter: "case", target: "case-back", title: "Read the details, then return", body: "The details panel describes this node and lists its sources. When you have finished reading, return to the current step.", action: "Select Back to step.", required: true },
    { chapter: "case", target: "case-share", title: "Copy a link to this case", body: "Copy link opens a preview of the case-study link. The preview explains what the link includes." },
    { chapter: "map", target: "map-canvas", title: "Explore the wider map", body: "The map connects what an agent can access or do, harmful actions, resulting conditions, and outcomes. Components and stages provide additional context. An affordance is access or capability available in a setting." },
    { chapter: "map", target: "map-fit", title: "Make the map fit your screen", body: "Fit adjusts the zoom and position to bring the whole visible map into view.", action: "Select Fit." },
    { chapter: "map", target: "map-expand-group", title: "Expand a group", body: "Groups collect related nodes to keep the overview readable. Expand this affordance group to see the individual forms of access or capability it contains.", action: "Select the highlighted expand control.", required: true },
    { chapter: "map", target: "map-node", title: "Read a node and its connections", body: "Select a node to open its description and inspect connected paths. On a keyboard, focus a node and press Enter. On desktop, Shift-click adds more nodes to your selection.", action: "Select a node on the map." },
    { chapter: "map", target: "map-filters", title: "Find tools for narrowing the map", body: "Filters control which parts of the map are shown. Open the toolbar to search, choose a saved view, or work with your selection.", action: "Select Show filters.", required: true },
    { chapter: "map", target: "map-search", title: "Find a topic", body: "Search highlights matching nodes. Select a match to inspect its connections. Clear the search when you want to explore the whole visible map again.", action: "Try a word from a node label." },
    { chapter: "map", target: "map-story", title: "Trace a possible path", body: "After this walkthrough, select a starting point and an outcome, then use these controls to trace a connection through the map's prerequisites." },
    { chapter: "map", target: "map-share", title: "Copy a link to your view", body: "Copy link creates a URL for the current selection, filters and column arrangement. Send that URL to let someone open the same map view." },
];
const EDITOR_STEPS: Step[] = [
    { chapter: "map", target: "map-edit", title: "Edit your own copy of the map", body: "Edit map lets you change node descriptions, add nodes and groups, and adjust prerequisites. Your changes are saved only in this browser and are not sent to the site.", action: "Select Edit map.", required: true },
    { chapter: "map", target: "map-add-node", title: "Add nodes and groups", body: "Add node and Add group open short forms for new entries. To change an existing node, open its details and use the editor there. Each change is checked against the whole map, and a change that would break it is explained instead of saved." },
    { chapter: "map", target: "local-map-bar", title: "Keep or share your edits", body: "Export map file saves your copy as a file you can keep or send to someone, who can load it with Import map file. Reset to original map discards your edits. A case study shared from an edited map includes the nodes it uses. Exiting this tutorial turns editing off without changing the map." },
];
interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}
function anchorFor(target: string): Element | null {
    const candidates = [...document.querySelectorAll(`[data-walkthrough="${target}"]`)].filter(el => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden]");
    });
    const visible = candidates.filter(el => { const rect = el.getBoundingClientRect(); return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight; });
    if (target === "map-node" || target === "case-node") {
        const reachable = visible.find(el => {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const hit = document.elementsFromPoint?.(x, y).find(element => !element.closest(".walkthrough-layer")) ?? document.elementFromPoint?.(x, y);
            return !document.elementFromPoint || !!hit && el.contains(hit);
        });
        return reachable ?? null;
    }
    return visible[0] ?? candidates[0] ?? null;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(n, Math.max(low, high)));
export function Walkthrough(props: WalkthroughProps) {
    return props.open ? <ActiveWalkthrough {...props}/> : null;
}
function ActiveWalkthrough({ onExit, onOpenMap, capture, restore, mapEditing = false }: WalkthroughProps) {
    const [steps] = useState(() => mapEditing ? [...BASE_STEPS, ...EDITOR_STEPS] : BASE_STEPS);
    const [started, setStarted] = useState(false);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [acted, setActed] = useState(false);
    const [dim, setDim] = useState(true);
    const [box, setBox] = useState<Box | null>(null);
    const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
    const [cardHeight, setCardHeight] = useState(310);
    const card = useRef<HTMLDivElement>(null);
    const callbacks = useRef({ onExit, onOpenMap, capture, restore });
    callbacks.current = { onExit, onOpenMap, capture, restore };
    const snapshots = useRef<unknown[]>([]);
    const returning = useRef(false);
    // A step's starting state is recorded once its control is on screen, so loading has finished.
    const arrival = useRef({ index: -1, recorded: false });
    const step = steps[index];
    const exit = (completed: boolean) => {
        dismissWalkthroughInvitation(completed);
        callbacks.current.onExit(completed);
    };
    const exitRef = useRef(exit);
    exitRef.current = exit;
    const gate = useRef({ started, target: step.target });
    gate.current = { started, target: step.target };
    const pointerOrigin = useRef<{
        node: Node;
        id: number;
    } | null>(null);
    useLayoutEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const targets = () => { const target = gate.current.started ? anchorFor(gate.current.target) : null; return target ? [target] : []; };
        const activeControls = () => [...targets(), ...document.querySelectorAll('[data-walkthrough="theme-toggle"]')];
        const permitted = (target: EventTarget | null) => target instanceof Node && (!!card.current?.contains(target) || activeControls().some(element => element.contains(target)));
        const stop = (event: Event) => {
            if (event.type === "pointerdown")
                pointerOrigin.current = event.target instanceof Node && targets().some(target => target.contains(event.target as Node)) ? { node: event.target, id: (event as PointerEvent).pointerId } : null;
            const captured = pointerOrigin.current && (event.type === "click" || (event as PointerEvent).pointerId === pointerOrigin.current.id) && event.target instanceof SVGSVGElement && event.target.contains(pointerOrigin.current.node) && ["pointermove", "pointerup", "pointercancel", "click"].includes(event.type);
            const reading = gate.current.target === "case-back" ? ".case-node-details" : gate.current.target === "map-node" ? "aside" : null;
            const scrollReading = reading && event.target instanceof Element && event.target.closest(reading) && ["wheel", "touchstart", "touchmove", "pointerdown", "pointermove", "pointerup", "pointercancel"].includes(event.type);
            if (!permitted(event.target) && !captured && !scrollReading) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            if (event.type === "click" || event.type === "pointercancel")
                window.setTimeout(() => { pointerOrigin.current = null; }, 0);
        };
        const focusable = () => {
            const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])';
            const elements = [card.current, ...activeControls()].filter((element): element is Element => !!element);
            return [...new Set(elements.flatMap(element => [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)]))].filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
            }) as HTMLElement[];
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                exitRef.current(false);
                return;
            }
            if (event.key === "Tab") {
                const elements = focusable();
                const at = elements.indexOf(document.activeElement as HTMLElement);
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!elements.length)
                    card.current?.focus();
                else
                    elements[(at + (event.shiftKey ? -1 : 1) + elements.length) % elements.length].focus();
                return;
            }
            stop(event);
        };
        const focus = (event: FocusEvent) => { if (!permitted(event.target)) {
            event.stopImmediatePropagation();
            card.current?.focus();
        } };
        const stopShortcuts = (event: KeyboardEvent) => event.stopPropagation();
        const blockedEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel", "click", "dblclick", "contextmenu", "wheel", "touchstart", "touchmove"];
        window.addEventListener("keydown", key, true);
        document.addEventListener("keydown", stopShortcuts);
        document.addEventListener("focusin", focus, true);
        blockedEvents.forEach(name => window.addEventListener(name, stop, { capture: true, passive: false }));
        return () => {
            window.removeEventListener("keydown", key, true);
            document.removeEventListener("keydown", stopShortcuts);
            document.removeEventListener("focusin", focus, true);
            blockedEvents.forEach(name => window.removeEventListener(name, stop, true));
            if (previous?.isConnected)
                previous.focus();
        };
    }, []);
    useEffect(() => {
        if (!started || step.chapter === "case")
            return;
        let live = true;
        setLoading(true);
        setError("");
        Promise.resolve().then(() => callbacks.current.onOpenMap(step.chapter as "entry" | "map"))
            .catch(() => { if (live)
            setError("This part of the walkthrough could not be opened. Retry, continue to the next part, or exit."); })
            .finally(() => { if (live)
            setLoading(false); });
        return () => { live = false; };
    }, [started, step.chapter, retry]);
    useLayoutEffect(() => {
        setActed(false);
        card.current?.focus();
        // Returning to a step restores its recorded state, which must not be overwritten.
        arrival.current = { index, recorded: returning.current };
        returning.current = false;
    }, [index, started]);
    const back = () => {
        let previous = index - 1;
        while (previous > 0 && snapshots.current[previous] === undefined)
            previous--;
        const saved = snapshots.current[previous];
        if (saved !== undefined)
            callbacks.current.restore?.(saved);
        returning.current = saved !== undefined;
        setIndex(previous);
    };
    useEffect(() => {
        if (!started || loading) {
            setBox(null);
            return;
        }
        let highlighted: Element | null = null;
        let pendingAction = false;
        const measure = () => {
            const target = anchorFor(step.target);
            if (highlighted !== target) {
                highlighted?.classList.remove("walkthrough-target");
                target?.classList.add("walkthrough-target");
                highlighted = target;
                if (target && step.target !== "map-canvas")
                    target.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
            }
            if (target && arrival.current.index === index && !arrival.current.recorded) {
                arrival.current.recorded = true;
                snapshots.current[index] = callbacks.current.capture?.();
            }
            const rect = target?.getBoundingClientRect();
            const next = rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
            setBox(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
            setViewport(old => old.width === window.innerWidth && old.height === window.innerHeight ? old : { width: window.innerWidth, height: window.innerHeight });
            const height = card.current?.getBoundingClientRect().height;
            if (height)
                setCardHeight(height);
            if (pendingAction && steps[index + 1] && anchorFor(steps[index + 1].target))
                setIndex(n => n === index ? n + 1 : n);
        };
        const action = (event: Event) => {
            if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ")
                return;
            const target = anchorFor(step.target);
            const origin = event.type === "pointerup" || event.type === "click" ? pointerOrigin.current?.node : null;
            if (target && event.target instanceof Node && (target.contains(event.target) || !!origin && target.contains(origin))) {
                setActed(true);
                if (step.required && (event.type === "click" || event.type === "pointerup" || event instanceof KeyboardEvent)) {
                    pendingAction = true;
                    window.setTimeout(measure, 0);
                }
            }
        };
        measure();
        const interval = window.setInterval(measure, 250);
        window.addEventListener("resize", measure);
        document.addEventListener("scroll", measure, true);
        document.addEventListener("click", action, true);
        document.addEventListener("pointerup", action, true);
        document.addEventListener("input", action, true);
        document.addEventListener("keydown", action, true);
        return () => {
            clearInterval(interval);
            highlighted?.classList.remove("walkthrough-target");
            window.removeEventListener("resize", measure);
            document.removeEventListener("scroll", measure, true);
            document.removeEventListener("click", action, true);
            document.removeEventListener("input", action, true);
            document.removeEventListener("pointerup", action, true);
            document.removeEventListener("keydown", action, true);
        };
    }, [started, loading, step.target, index]);
    const mobile = viewport.width < 680;
    const width = Math.min(380, viewport.width - 24);
    const left = !started ? (viewport.width - width) / 2 : mobile ? 12 : box && box.left > width + 36 ? box.left - width - 24 : clamp((box?.left ?? 0) + (box?.width ?? 0) + 24, 12, viewport.width - width - 12);
    const mobileTop = box && box.height < viewport.height * .6 && box.top + box.height / 2 > viewport.height / 2 ? 12 : Math.max(12, viewport.height - cardHeight - 12);
    const top = !started ? clamp((viewport.height - cardHeight) / 2, 12, viewport.height - cardHeight - 12) : mobile ? mobileTop : clamp(box?.top ?? 80, 12, viewport.height - cardHeight - 12);
    const targetX = box ? clamp(box.left + box.width / 2, 8, viewport.width - 8) : 0;
    const targetY = box ? clamp(box.top + box.height / 2, 8, viewport.height - 8) : 0;
    const covered = targetX >= left && targetX <= left + width && targetY >= top && targetY <= top + cardHeight;
    const arrow = box && guideArrow({ left, top, width, height: cardHeight }, box);
    const chapterSteps = steps.filter(item => item.chapter === step.chapter);
    const chapterIndex = chapterSteps.indexOf(step) + 1;
    return <div class="walkthrough-layer" data-testid="walkthrough">
    <svg class="walkthrough-guide" width={viewport.width} height={viewport.height} aria-hidden="true">
      <defs><marker id="walkthrough-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
      {dim && <path class="walkthrough-shade" fill-rule="evenodd" d={`M0 0H${viewport.width}V${viewport.height}H0Z${box ? ` M${Math.max(0, box.left - 6)} ${Math.max(0, box.top - 6)}H${Math.min(viewport.width, box.left + box.width + 6)}V${Math.min(viewport.height, box.top + box.height + 6)}H${Math.max(0, box.left - 6)}Z` : ""}`}/>}
      {started && arrow && !covered && <line class="walkthrough-arrow" {...arrow} marker-end="url(#walkthrough-arrow)"/>}
    </svg>
    <div class="walkthrough-card" ref={card} style={{ left, top, width }} role="dialog" aria-modal="false" aria-labelledby="walkthrough-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
      <div class="walkthrough-heading"><span>{started ? `${step.chapter === "entry" ? "Getting started" : step.chapter === "case" ? "Case study" : "Map"} · ${chapterIndex} of ${chapterSteps.length}` : "Welcome"}</span><button class="walkthrough-exit" onClick={() => document.querySelector<HTMLButtonElement>('[data-walkthrough="theme-toggle"]')?.click()} aria-label="Change color theme">Light / dark</button><button class="walkthrough-exit" onClick={() => exit(false)} aria-label="Exit walkthrough">Exit</button></div>
      <h2 id="walkthrough-title">{started ? step.title : "Follow one case, then explore the map"}</h2>
      <p>{started ? step.body : "This map explores how an AI agent's access could lead to harmful actions and outcomes. A short guided example introduces the case-study tools, then shows how to explore the wider map."}</p>
      {!started && <p>You will open the case yourself. During the walkthrough, the highlighted controls, this guide and the light/dark mode switch remain active. Exit restores your previous view and enables all controls.</p>}
      {started && <div class="walkthrough-status" aria-live="polite">
        {loading ? <p>Preparing the map…</p> : error ? <p>{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p> : <>
          {step.action && <p>{acted ? "Done. Continue when you are ready." : step.action}</p>}
          {!box && <p>This control is not visible yet. Wait for it to load, go Back, or exit. The walkthrough will point to it when it appears.</p>}
          {box && covered && <p>The highlighted area is behind this card. Turn off background dimming to explore it, or continue to the next control.</p>}
        </>}
      </div>}
      <label class="walkthrough-dimming"><input type="checkbox" checked={dim} onChange={e => setDim(e.currentTarget.checked)}/> Dim the background</label>
      <div class="walkthrough-buttons">
        {started ? <><button disabled={index === 0 || loading} onClick={back}>Back</button><button disabled={loading || !!step.required} onClick={() => index === steps.length - 1 ? exit(true) : setIndex(n => n + 1)}>{index === steps.length - 1 ? "Finish" : "Next"}</button></> : <button onClick={() => { dismissWalkthroughInvitation(); setStarted(true); }}>Start guided example</button>}
      </div>
      {started && step.chapter === "case" && <button class="walkthrough-skip" disabled={loading} onClick={() => setIndex(steps.findIndex(item => item.chapter === "map"))}>Skip to map tools</button>}
    </div>
  </div>;
}
