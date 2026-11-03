import type { Graph, } from "./selectors.js";
import type { ProseBundle } from "../types.js";
import type { AnalysisDocument, ReaderJudgment } from "./reader-state.js";
import type { CaseAction } from "./case-edit.js";
import { tourStateAt, tourWarnings } from "./tour.js";
import { caseReview } from "./case-codec.js";
export function CaseText({ text, graph, prose, onSelect }: {
    text: string;
    graph: Graph;
    prose: ProseBundle | null;
    onSelect: (id: string) => void;
}) {
    return <>{text.split(/(\[\[[^\]]+\]\]|\[@[^\]]+\])/g).map(part => {
            if (part.startsWith("[[")) {
                const [id, label] = part.slice(2, -2).split("|");
                return <button class="idlink" onClick={() => onSelect(id)}>{label ?? graph.byId.get(id)?.label ?? id}</button>;
            }
            if (part.startsWith("[@")) {
                const key = part.slice(2, -1);
                const source = prose?.references[key];
                return source ? <a href={source.url && /^https?:\/\//.test(source.url) ? source.url : undefined} target="_blank" rel="noreferrer" title={source.title}>{`[${key}]`}</a> : <span title="Source not loaded or unresolved">{part}</span>;
            }
            return part;
        })}</>;
}
interface Props {
    hidden?: boolean;
    onViewDetails: (id: string) => void;
    document: AnalysisDocument;
    graph: Graph;
    prose: ProseBundle | null;
    active: number;
    editing: boolean;
    limit: boolean;
    onLimit: (value: boolean) => void;
    onStep: (index: number) => void;
    onSelect: (id: string) => void;
    dispatch: (action: CaseAction) => void;
}
export function CasePanel({ document: doc, graph, prose, active, editing, limit, onLimit, onStep, onSelect, onViewDetails, hidden, dispatch }: Props) {
    const c = doc.content;
    const step = c.presentation.steps[active];
    const tour = tourStateAt(doc, active);
    const review = caseReview(doc, graph.index);
    const label = (id: string) => graph.byId.get(id)?.label ?? id;
    const inline = (text: string) => <CaseText text={text} graph={graph} prose={prose} onSelect={onSelect}/>;
    const claims = step.occurrences.flatMap(r => { const o = c.stories.find(s => s.id === r.story)?.occurrences.find(o => o.id === r.occurrence); return o ? [{ ref: r, occurrence: o }] : []; });
    const judgments: Record<ReaderJudgment["value"], string> = { supported: "Supported by evidence", assumed: "Assumed for this analysis", uncertain: "Uncertain", absent: "Absent in this scenario", disputed: "Disagree with this claim", "disputed-assumption": "Disagree with this assumption" };
    const field = (label: string, value: string, save: (value: string) => void, id?: string) => <label>{label}<textarea id={id} key={`${step.id}-${label}-${value}`} defaultValue={value} onBlur={e => { if (e.currentTarget.value !== value)
        save(e.currentTarget.value); }}/></label>;
    return <section class="case-panel" data-walkthrough="case-step" aria-label="Case study step" hidden={hidden}>
    <section aria-label="Story details"><small>Case study</small>
    {editing ? field("Case title", c.title, title => dispatch({ type: "details", title })) : <h2>{c.title}</h2>}
    <section class="case-premise"><h3>Premise</h3>{editing ? field("Premise", c.premise, premise => dispatch({ type: "details", premise })) : c.premise && <p>{inline(c.premise)}</p>}
    </section>
    </section>
    {editing && review.length > 0 && <details><summary>Map references to review ({review.length})</summary><p>Automatic checks against the current map.</p><ul>{review.map(r => <li>{r}</li>)}</ul></details>}
    <div class="case-navigation"><button disabled={active === 0} onClick={() => onStep(active - 1)}>Previous</button><span aria-live="polite">Step {active + 1} of {c.presentation.steps.length}</span><button disabled={active === c.presentation.steps.length - 1} onClick={() => onStep(active + 1)}>Next</button></div>
    {editing ? field("Step title", step.title, title => dispatch({ type: "text", step: step.id, title })) : <h3>{step.title}</h3>}
    {tourWarnings(doc).some(w => w.stepId === step.id && w.kind === "out-of-order") && <p class="case-order-note">Order check: this step is presented before one of its prerequisites.</p>}
    {(editing || step.caption) && <section class="case-authored" data-authorship="authored"><h4>Author's note</h4>{editing ? field("Author's note", step.caption, caption => dispatch({ type: "text", step: step.id, caption }), `caption-${step.id}`) : <p>{inline(step.caption)}</p>}</section>}
    {(editing || step.narrative) && <section class="case-narrative" data-authorship="authored" aria-label="Step narrative">
      <h4>Additional explanation</h4>
      {editing ? field("Step narrative", step.narrative ?? "", narrative => dispatch({ type: "text", step: step.id, narrative })) : <p class="case-prose">{inline(step.narrative ?? "")}</p>}
    </section>}
    {claims.length > 0 && <><h3>Claims in this step</h3><p>Each item below is a claim about this step: where it happens, what is involved, or what happens as a result. Status labels and your assessment are listed under each claim.</p><p class="hint">Show a claim on the map or open its node details for background and sources.{editing && " Wording, subtitles and evidence overrides apply only to this case study."}</p></>}
    {claims.map(({ ref, occurrence: o }) => {
            const node = graph.byId.get(o.node);
            const j = c.judgments.find(j => j.target.kind === "occurrence" && j.target.story === ref.story && j.target.occurrence === ref.occurrence);
            const local = o.presentation;
            const patch = (patch: NonNullable<typeof local>) => dispatch({ type: "claim-text", ref, patch });
            const kind = graph.index.layers.find(l => l.name === node?.layer)?.label ?? "Map reference";
            const meaning: Record<string, string> = { component: "A part of the system", stage: "Where in the pipeline this happens", affordance: "What the agent can do", "failure-mode": "An action that can cause harm", condition: "A state this step relies on or brings about", event: "The resulting outcome" };
            return <section class="case-evidence" key={`${step.id}-${ref.story}-${ref.occurrence}`}>
        <h4 class="case-claim-kind"><strong title={node && meaning[node.layer]} tabIndex={node && meaning[node.layer] ? 0 : undefined}>{kind}</strong>: {local?.label ?? label(o.node)}</h4>
        <div class="case-claim-actions"><button onClick={() => onSelect(o.node)} disabled={!node}>Show on map</button><button data-walkthrough="case-details" onClick={() => onViewDetails(o.node)} disabled={!node}>View node details</button></div>
        {editing && field("Claim wording", local?.label ?? label(o.node), value => patch({ label: value.trim() && value !== label(o.node) ? value : undefined }))}
        {local?.label !== undefined && <p class="hint">Map label: {label(o.node)}{editing && <> <button onClick={() => patch({ label: undefined })}>Use map wording</button></>}</p>}
        {editing ? <>{field("Concrete detail", local?.subtitle ?? "", subtitle => patch({ subtitle }))}<small>A case-specific name or note, such as Artifactory. Shown inside this node on the case map.</small></> : local?.subtitle && <p class="case-concrete-detail">{inline(local.subtitle)}</p>}
        <details><summary>Status and your assessment</summary>
        <p>{local?.status !== undefined ? "Case evidence status" : "Map evidence status"}: {graph.index.taxonomies.status.values[local?.status ?? node?.status ?? ""]?.label ?? local?.status ?? node?.status ?? "unresolved reference"}. {(local?.needsCitation ?? node?.needsCitation) ? "Citation needed." : ""}</p>
        {editing && <><label>Evidence status<select value={local?.status ?? node?.status ?? ""} onChange={e => patch({ status: e.currentTarget.value })}>{Object.entries(graph.index.taxonomies.status.values).map(([value, item]) => <option value={value}>{item.label}</option>)}</select></label>
          <label><input type="checkbox" checked={local?.needsCitation ?? node?.needsCitation ?? false} onChange={e => patch({ needsCitation: e.currentTarget.checked })}/> Citation needed in this case</label>
          {(local?.status !== undefined || local?.needsCitation !== undefined) && <button onClick={() => patch({ status: undefined, needsCitation: undefined })}>Use map evidence defaults</button>}
        </>}
        <p>Your assessment: {j && tour.visibleJudgments.has(j.id) ? judgments[j.value] : "Not assessed"}{j?.value === "supported" && !j.sources.length ? " — reader marked supported; no source supplied" : ""}.</p>
        {j?.note && tour.visibleJudgments.has(j.id) && <p>{inline(j.note)}</p>}
        {j && tour.visibleJudgments.has(j.id) && j.sources.map(s => <p>{s.label}: {s.reference.kind === "url" ? <a href={/^https?:\/\//i.test(s.reference.url) ? s.reference.url : undefined} target="_blank" rel="noreferrer">{s.reference.url}</a> : s.reference.kind === "citation" ? inline(`[@${s.reference.key}]`) : s.reference.text}</p>)}
        {editing && <><label>Your assessment<select value={j?.value ?? ""} onChange={e => dispatch({ type: "judge", step: step.id, clear: !e.currentTarget.value, judgment: { id: j?.id ?? crypto.randomUUID(), target: { kind: "occurrence", ...ref }, value: (e.currentTarget.value || "uncertain") as ReaderJudgment["value"], note: j?.note ?? "", sources: j?.sources ?? [] } })}><option value="">Not assessed</option>{Object.entries(judgments).map(([value, text]) => <option value={value}>{text}</option>)}</select></label>
          {j && <label>Assessment note<textarea defaultValue={j.note} onBlur={e => dispatch({ type: "judge", step: step.id, judgment: { ...j, note: e.currentTarget.value } })}/></label>}
          {j && <label>Assessment source (URL, @citation, or text)<input defaultValue={j.sources[0]?.reference.kind === "url" ? j.sources[0].reference.url : j.sources[0]?.reference.kind === "citation" ? `@${j.sources[0].reference.key}` : j.sources[0]?.reference.kind === "text" ? j.sources[0].reference.text : ""} onBlur={e => {
                            const value = e.currentTarget.value.trim();
                            dispatch({ type: "judge", step: step.id, judgment: { ...j, sources: value ? [{ label: "Reader source", reference: /^https?:\/\//.test(value) ? { kind: "url", url: value } : value.startsWith("@") ? { kind: "citation", key: value.slice(1) } : { kind: "text", text: value } }] : [] } });
                        }}/></label>}
          </>}
        <p class="case-assessment-note">Assessments record your judgment. The app does not calculate their effects on later claims.</p>
        </details>
        {o.argument.kind === "requirement" && o.argument.ref.partial && <section class="case-gap"><h4>Assumptions this story makes</h4><small>{local?.assumption === undefined ? "Default explanation from the map" : "Edited for this case study"}</small>{editing ? field("Assumption", local?.assumption ?? o.argument.ref.note, assumption => patch({ assumption })) : <p>{inline(local?.assumption ?? o.argument.ref.note)}</p>}</section>}

      </section>;
        })}
    
    {active === c.presentation.steps.length - 1 && <section><h3>Interpretation</h3>{editing ? field("Interpretation", c.interpretation, interpretation => dispatch({ type: "details", interpretation })) : <p>{inline(c.interpretation)}</p>}</section>}
    <label><input type="checkbox" checked={limit} onChange={e => onLimit(e.currentTarget.checked)}/> Show only case-study nodes</label>
    <p>Hide map nodes outside this case study. Nodes from every step remain visible. Uncheck to show the rest of the map. Hidden nodes keep their existing assessments.</p>
    <details><summary>How to read the map</summary><p>Bold outlines: claims in this step. Solid outlines: earlier claims. Dashed outlines: later claims. Actor icons keep their position until moved in a later step.</p><p>The timeline is a suggested explanation order, not a record of when events happened.</p></details>
  </section>;
}
