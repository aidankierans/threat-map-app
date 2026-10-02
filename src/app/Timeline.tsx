import { useEffect } from "preact/hooks";
import type { AnalysisDocument, PresentationStep } from "./reader-state.js";
import type { CaseAction } from "./case-edit.js";
import { tourWarnings } from "./tour.js";
interface Props {
    document: AnalysisDocument;
    active: number;
    editing: boolean;
    onStep: (index: number) => void;
    dispatch: (action: CaseAction) => void;
    pick: string | null;
    onPick: (step: string | null, actor?: string) => void;
    derived?: PresentationStep[];
}
export function Timeline({ document: doc, active, editing, onStep, dispatch, pick, onPick, derived = [] }: Props) {
    const steps = doc.content.presentation.steps;
    const warnings = tourWarnings(doc);
    useEffect(() => { globalThis.document.getElementById(`case-card-${steps[active]?.id}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, steps]);
    const insert = (after: number, kind: "moment" | "caption") => dispatch({ type: "insert", after, kind, id: crypto.randomUUID() });
    return <nav id="case-timeline" class="case-timeline" data-walkthrough="case-timeline" aria-label="Case study timeline">
    <div class="case-timeline-head"><strong>Timeline</strong></div>
    {editing && <div class="case-insert"><button onClick={() => insert(-1, "moment")}>Add opening moment</button><button onClick={() => insert(-1, "caption")}>Add opening note</button></div>}
    <ol>{steps.map((step, i) => <li key={step.id} id={`case-card-${step.id}`} class={`case-step ${editing ? "editing" : "reading"} ${i === active ? "current" : ""}`}>
      <button class="case-step-jump" aria-current={i === active ? "step" : undefined} onClick={() => onStep(i)}><span>{i + 1}.</span> {step.title}</button>
      {editing && warnings.filter(w => w.stepId === step.id && !w.acknowledged).length > 0 && <details><summary>Review step order</summary>
        {warnings.filter(w => w.stepId === step.id && !w.acknowledged).map(w => <p>{w.message}</p>)}
        {editing && <div><button onClick={() => { onStep(i); setTimeout(() => globalThis.document.getElementById(`caption-${step.id}`)?.focus(), 0); }}>Edit author note</button><button onClick={() => dispatch({ type: "acknowledge", step: step.id })}>Keep this order</button></div>}
      </details>}
      {editing && <div class="case-step-edit">
        <div class="case-actions">
          <button disabled={i === 0} onClick={() => dispatch({ type: "move", step: step.id, to: i - 1 })}>Move up</button><button disabled={i === steps.length - 1} onClick={() => dispatch({ type: "move", step: step.id, to: i + 1 })}>Move down</button>
          <button disabled={steps.length === 1} onClick={() => dispatch({ type: "delete", step: step.id })}>Delete step</button>
          {derived.find(s => s.id === step.id) && <button onClick={() => dispatch({ type: "revert", step: step.id, derived: derived.find(s => s.id === step.id)! })}>Revert to derived</button>}
        </div>
        {step.kind === "moment" && <button aria-pressed={pick === step.id} onClick={() => onPick(pick === step.id ? null : step.id)}>Pick on canvas</button>}
        {step.occurrences.map(r => { const o = doc.content.stories.find(s => s.id === r.story)?.occurrences.find(o => o.id === r.occurrence); return <div class="case-assigned">{o?.node}<button aria-label={`Remove ${o?.node} from step`} onClick={() => dispatch({ type: "assign", step: step.id, ref: r, remove: true })}>Remove</button></div>; })}
        <details><summary>Actor positions</summary>{doc.content.actors.map(a => <div><span>{a.label}</span><button onClick={() => onPick(step.id, a.id)}>Place on canvas</button><small>{step.actors.some(p => p.actor === a.id) ? "Placed here" : "Carries previous position"}</small></div>)}</details>
        <div class="case-insert"><button onClick={() => insert(i, "moment")}>Add moment after</button><button onClick={() => insert(i, "caption")}>Add note after</button></div>
      </div>}
    </li>)}</ol>
  </nav>;
}
