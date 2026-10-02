import type { Graph } from "./selectors.js";
import type { StoryResult } from "./story.js";
import { MAX_WAYPOINTS } from "./story.js";
interface Props {
    onSaveCase?: () => void;
    graph: Graph;
    result: StoryResult;
    onSelect: (id: string) => void;
}
export function StoryPanel({ graph, result, onSelect, onSaveCase }: Props) {
    const label = (id: string) => graph.byId.get(id)?.label ?? id;
    const nodeLink = (id: string) => <button class="idlink" onClick={() => onSelect(id)}>{label(id)}</button>;
    return <div class="storywrap">
    <h2>Pathway steps</h2>
    {onSaveCase && result.stories.length > 0 && <button class="btn" onClick={onSaveCase}>Save as case study</button>}
    <p class="hint">{result.mode === "all" ? "A pathway through the selected nodes." : "A pathway for each selected node."} These are prerequisite relationships, not evidence that the events occurred or a timeline of an incident.</p>
    {result.problems.map(problem => <p key={problem} class="storyproblem">{problem}</p>)}
    {result.stories.map((story, i) => <section class="story" key={`${story.destination}:${story.waypoints.join(",")}`}>
      <h3>{result.stories.length > 1 ? `${i + 1}. ` : ""}{label(story.destination)}</h3>
      <p class="hint">{story.steps.length} steps · {story.gaps.length ? `${story.gaps.length} declared ${story.gaps.length === 1 ? "gap" : "gaps"}` : "No declared gaps in the selected prerequisites"}</p>
      <ol class="storysteps">{story.steps.map(step => {
                const gate = graph.index.gates[step.id]?.[step.group];
                return <li key={step.id} class={step.picked ? "picked" : undefined}>
          {nodeLink(step.id)}
          <span class="storylayer">{graph.index.layers.find(l => l.name === step.layer)?.label ?? step.layer}</span>
          {step.group < 0 && <span class="hint">Starting assumption</span>}
          {step.because.length > 0 && <details><summary>Required inputs ({step.because.length})</summary><ul>{step.because.map(input => <li key={input.from}>{nodeLink(input.from)}{input.declared && <> (supplies {nodeLink(input.declared)})</>}</li>)}</ul>{gate?.note && !step.incomplete && <p>{gate.note}</p>}</details>}
          {step.incomplete && <div class="case-gap"><strong>Declared gap</strong><p>{gate?.note || "The listed prerequisites do not fully establish this step. Additional assumptions are required."}</p></div>}
        </li>;
            })}</ol>
      <p class="hint">Check that the inputs refer to the same deployment and actors. Open each node for its sources and assumptions.</p>
    </section>)}
    {!result.stories.length && !result.problems.length && <p class="hint">Select a starting point and an outcome. You can include up to {MAX_WAYPOINTS} nodes in a pathway.</p>}
  </div>;
}
