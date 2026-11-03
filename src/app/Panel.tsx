import type { ComponentIndex, Edge, IndexNode, Provenance, ProseBundle, Status, Taxonomies, } from "../types.js";
import { componentsFor, bandDetailOf, gateGroupOf, gatesOf, isLayer, type Graph, } from "./selectors.js";
import { REPO_SOURCE_BASE } from "./config.js";
import type { HistoryNav } from "./history.js";
import { DocHistoryButtons } from "./DocHistory.js";
import { ProseBody, type EditableProse } from "./ProseBody.js";
import type { DevTools } from "./devtools.js";
import { isEdgeId } from "../edge-id.js";
import { StoryPanel } from "./StoryPanel.js";
import { Term } from "./Term.js";
import { TERMS, type TermName } from "./terms.js";
import type { StoryResult } from "./story.js";
import { gateId } from "../gate-id.js";
interface Props {
    onSaveCase?: () => void;
    graph: Graph;
    prose: ProseBundle | null;
    selection: string[];
    nav: HistoryNav;
    onCanvas: ReadonlySet<string>;
    selectable?: ReadonlySet<string>;
    onSelectContents?: (ids: string[]) => void;
    onSelect: (id: string) => void;
    onClose: () => void;
    folded?: ReadonlySet<string>;
    onToggleFold?: (key: string) => void;
    editable?: EditableProse;
    devtools?: DevTools;
    story?: StoryResult | null;
}
export function Panel({ graph, prose, selection, nav, onCanvas, selectable, onSelectContents, onSelect, onClose, folded, onToggleFold, editable, devtools, story, onSaveCase, }: Props) {
    return (<aside>
      <DocHistoryButtons graph={graph} nav={nav}/>
      
      <button class="closex" onClick={onClose} title="Close the detail panel" aria-label="Close the detail panel">
        ✕
      </button>
      {story && <StoryPanel graph={graph} result={story} onSelect={onSelect} onSaveCase={onSaveCase}/>}
      {selection.length === 0 ? (story ? null : <Intro graph={graph}/>) : (<>
          {selection.length > 1 && (<p class="hint" style={{ marginBottom: 10 }}>
              {selection.length} items selected — shift-click to add or remove one.
            </p>)}
          {selection.map((id) => {
                const band = bandDetailOf(graph, id);
                if (band) {
                    const members = band.members.filter((member) => (selectable ?? onCanvas).has(member));
                    const doc = prose?.docs[band.id];
                    return (<section key={id} style={{ marginBottom: selection.length > 1 ? 28 : 0 }}>
                  <div class="kicker">{band.displayOnly ? "Display family" : "Group"}</div>
                  <h2>{band.label}</h2>
                  <ProseBody id={band.id} html={doc?.html} class="prose" fallback={<p>{band.lead}</p>}/>
                  {band.kind && (<p>
                      {band.kind === "partition" ? "Exactly one of these holds" :
                                band.kind === "scale" ? "Reaching a rung means every rung above it holds too" :
                                    "Any number of these can hold at once"}
                      {band.subject ? ` for ${band.subject}.` : "."}
                    </p>)}
                  {band.children && <>
                    <h3>Groups in this family</h3>
                    <ul>{band.children.map(child => <li key={child.id}>
                      <a href={`#/node/group:${child.id}`} onClick={e => {
                                    e.preventDefault();
                                    if (folded?.has(band.id))
                                        onToggleFold?.(band.id);
                                    onSelect(`group:${child.id}`);
                                }}>{child.label}</a>
                    </li>)}</ul>
                  </>}
                  <h3>{band.children ? "All conditions" : "Members"}</h3>
                  <ul>
                    {band.members.map((member) => (<li key={member}>
                        <a href={`#/node/${member}`} onClick={(e) => { e.preventDefault(); onSelect(member); }}>
                          {graph.byId.get(member)?.label ?? member}
                        </a>
                        {!onCanvas.has(member) && <span class="hint"> (hidden by filters)</span>}
                      </li>))}
                  </ul>
                  {onToggleFold && folded && (<button class="btn" onClick={() => onToggleFold(band.id)} title={folded.has(band.id)
                                ? "Draw this group's members as their own boxes again"
                                : "Draw this group as one box, with its members' relations gathered onto it"}>
                      {folded.has(band.id) ? "Expand group" : "Collapse group"}
                    </button>)}{" "}
                  {onSelectContents && (<button class="btn" disabled={!members.length} onClick={() => onSelectContents(members)}>
                      Select contents ({members.length})
                    </button>)}
                  <p class="hint">Select contents selects members visible in the current view and matching the search. Shift-click the group to add or remove them from your selection.</p>
                  <Evidence prose={prose} cites={doc?.cites}/>
                  {band.source && <SourceLink source={band.source}/>}
                </section>);
                }
                const gate = gateGroupOf(graph, id);
                if (gate) {
                    return (<GateDetail key={id} graph={graph} gate={gate} onCanvas={onCanvas} onSelect={onSelect} compact={selection.length > 1}/>);
                }
                if (isEdgeId(id)) {
                    const edge = graph.edgeById.get(id);
                    if (!edge)
                        return null;
                    return (<EdgeDetail key={id} graph={graph} prose={prose} id={id} edge={edge} onSelect={onSelect} compact={selection.length > 1} editable={editable} devtools={devtools}/>);
                }
                const node = graph.byId.get(id);
                if (!node)
                    return null;
                return (<NodeDetail key={id} graph={graph} prose={prose} node={node} onSelect={onSelect} compact={selection.length > 1} editable={editable} devtools={devtools}/>);
            })}
        </>)}
    </aside>);
}
function NodeDetail({ graph, prose, node, onSelect, compact, editable, devtools, }: {
    graph: Graph;
    prose: ProseBundle | null;
    node: IndexNode;
    onSelect: (id: string) => void;
    compact: boolean;
    editable?: EditableProse;
    devtools?: DevTools;
}) {
    const tax = graph.index.taxonomies;
    const layer = graph.index.layers.find((l) => l.name === node.layer);
    const doc = prose?.docs[node.id];
    const components = componentsFor(graph, node.id);
    const term = node.layer === "event" ? "outcome" : node.layer;
    return (<section style={{ marginBottom: compact ? 28 : 0 }}>
      
      <div class="kicker">
        {node.id} · {term in TERMS ? <Term term={term as TermName}>{layer?.label ?? node.layer}</Term> : layer?.label ?? node.layer}
      </div>
      <h2>{node.label}</h2>

      <div class="chips">
        <Term term="evidence-status">Evidence status</Term>
        <StatusChip status={node.status} provenance={node.provenance} taxonomies={tax}/>
      </div>

      
      {node.phase && (<p class="hint" style={{ marginTop: 2 }}>
          Phase:{" "}
          <strong style={{ color: "var(--ink-1)" }}>
            {node.phase} · {tax.phase?.values[node.phase]?.label ?? node.phase}
          </strong>
        </p>)}

      {node.context && (<p class="hint" style={{ marginTop: 2 }}>
          Deployment context: <strong style={{ color: "var(--ink-1)" }}>{node.context}</strong>
          {node.context === "internal"
                ? " — performed inside the developer's trust boundary"
                : node.context === "external"
                    ? " — performed by someone other than the developer"
                    : " — release boundary"}
        </p>)}

      {isLayer(node, "component") && <StackPlace graph={graph} node={node} onSelect={onSelect}/>}

      <ProseBody id={node.id} html={doc?.html} class="prose" fallback={<p class="hint">{node.lead}</p>} editable={editable}/>

      {isLayer(node, "condition") && (<BandMembers graph={graph} node={node} onSelect={onSelect}/>)}


      {components.length > 0 && (<>
          <h3>Component stack</h3>
          <ul>
            {components.map((c) => (<li key={c.id}>{c.label}</li>))}
          </ul>
        </>)}

      {devtools && <devtools.RelationAdder node={node}/>}

      <Evidence prose={prose} cites={doc?.cites}/>
      <SourceLink source={node.source}/>
    </section>);
}
function Evidence({ prose, cites }: {
    prose: ProseBundle | null;
    cites?: string[];
}) {
    if (!prose || !cites?.length)
        return null;
    return (<>
      <h3>Evidence</h3>
      <ul>
        {cites.map((key) => {
            const ref = prose.references[key];
            if (!ref)
                return null;
            return (<li key={key}>
              <a href={/^https?:\/\//i.test(ref.url) ? ref.url : undefined} target="_blank" rel="noopener" data-cite={key}>
                {ref.title}
              </a>
            </li>);
        })}
      </ul>
    </>);
}
function SourceLink({ source }: {
    source: string;
}) {
    return (REPO_SOURCE_BASE ? <a class="sourcelink" href={`${REPO_SOURCE_BASE}/${source}`} target="_blank" rel="noopener">
      View source
    </a> : null);
}
function GateDetail({ graph, gate, onCanvas, onSelect, compact, }: {
    graph: Graph;
    gate: {
        gatedId: string;
        group: number;
        members: string[];
    };
    onCanvas: ReadonlySet<string>;
    onSelect: (id: string) => void;
    compact: boolean;
}) {
    const absent = gate.members.filter((id) => !onCanvas.has(id));
    const group = gatesOf(graph, gate.gatedId)[gate.group];
    const link = (id: string) => {
        const target = graph.byId.get(id);
        const off = !onCanvas.has(id);
        return (<a class={off ? "off-canvas" : undefined} href={`#/node/${id}`} onClick={(e) => {
                e.preventDefault();
                onSelect(id);
            }}>
        {off && "°"}
        {id}
        {target ? ` — ${target.label}` : ""}
      </a>);
    };
    return (<section style={{ marginBottom: compact ? 28 : 0 }}>
      <div class="kicker">
        AND gate · {gate.members.length} of {gate.gatedId}&rsquo;s requirements
      </div>
      
      <h2>
        {gate.members.map((id) => graph.byId.get(id)?.label ?? id).join(" and ")} — together
      </h2>

      <div class="chips">
        <span class="chip">conjunction</span>
        {group?.partial && <span class="chip status-draft">partial — remainder out of scope</span>}
        {absent.length > 0 && (<span class="chip status-draft">
            {absent.length} filtered off the canvas
          </span>)}
      </div>

      <p class="hint">
        {group?.partial
            ? "This conjunction lists necessary conditions for this route; additional conditions are out of scope:"
            : "This is a jointly sufficient conjunction of the following necessary conditions:"}
      </p>
      {group?.partial && group.note && <p class="hint">{group.note}</p>}

      <ol class="ladder">
        {gate.members.map((id) => (<li key={id}>{link(id)}</li>))}
      </ol>

      {absent.length > 0 && (<p class="hint">
          <span class="off-canvas">°</span> is a member that is currently filtered out.
        </p>)}
    </section>);
}
function EdgeDetail({ graph, prose, id, edge, onSelect, compact, editable, devtools, }: {
    graph: Graph;
    prose: ProseBundle | null;
    id: string;
    edge: Edge;
    onSelect: (id: string) => void;
    compact: boolean;
    editable?: EditableProse;
    devtools?: DevTools;
}) {
    const tax = graph.index.taxonomies;
    const meta = graph.index.edgeDocs[id];
    const doc = prose?.docs[id];
    const from = graph.byId.get(edge.from);
    const to = graph.byId.get(edge.to);
    const memberships = edge.groups.filter((gi) => (graph.index.gates[edge.to]?.[gi]?.all.length ?? 0) > 1);
    const link = (nodeId: string) => {
        const target = graph.byId.get(nodeId);
        return (<a href={`#/node/${nodeId}`} onClick={(e) => {
                e.preventDefault();
                onSelect(nodeId);
            }}>
        {nodeId}
        {target ? ` — ${target.label}` : ""}
      </a>);
    };
    return (<section style={{ marginBottom: compact ? 28 : 0 }}>
      
      <div class="kicker">
        {edge.from} enables {edge.to}
      </div>
      <h2>{meta?.label ?? `${from?.label ?? edge.from} → ${to?.label ?? edge.to}`}</h2>

      <div class="chips">
        {memberships.map((gi) => (<button key={gi} type="button" class="chip" title="Open the conjunction this edge is part of" onClick={() => onSelect(gateId(edge.to, gi))}>
            in a conjunction
          </button>))}
        {meta && (<StatusChip status={meta.status} provenance={meta.provenance} taxonomies={tax}/>)}
      </div>

      <ProseBody id={id} html={doc?.html} class="prose" fallback={<p class="hint">
            No argument recorded for this relation yet. Writing one means adding{" "}
            <code>content/edges/{id}.md</code> with <code>from</code> and <code>to</code> in its
            frontmatter — the relation itself stays declared in{" "}
            <code>{edge.to}</code>'s <code>enabled_by</code>.
          </p>} editable={editable}/>

      <h3>Joins</h3>
      <ul>
        <li>
          From: {link(edge.from)}
        </li>
        <li>
          To: {link(edge.to)}
        </li>
      </ul>

      {devtools && (<devtools.EdgeRemover edge={edge} id={id} documented={id in graph.index.edgeDocs}/>)}

      <Evidence prose={prose} cites={doc?.cites}/>
      {meta && <SourceLink source={meta.source}/>}
    </section>);
}
export function StatusChip({ status, provenance, taxonomies, }: {
    status: Status;
    provenance: Provenance;
    taxonomies: Taxonomies;
}) {
    const st = taxonomies.status.values[status];
    const pr = taxonomies.provenance.values[provenance];
    return (<details class="statuschip">
      <summary class={`chip status-${status}`}>
        {st?.label ?? status}
      </summary>
      <div class="statuswhy">
        {st?.description && (<p>
            <strong>{st.label}</strong> — {st.description}
          </p>)}
        {pr?.description && (<p>
            <strong>{pr.label}</strong> — {pr.description}
          </p>)}
      </div>
    </details>);
}
function BandMembers({ graph, node, onSelect, }: {
    graph: Graph;
    node: IndexNode;
    onSelect: (id: string) => void;
}) {
    const group = graph.index.groups.find((sg) => sg.members.includes(node.id));
    if (!group || group.kind !== "scale")
        return null;
    return (<>
      <h3>Ladder</h3>
      <p class="hint">{group.label}</p>
      <ol class="ladder">
        {group.members.map((id) => {
            const member = graph.byId.get(id);
            const here = id === node.id;
            return (<li key={id} class={here ? "rung here" : "rung"}>
              {here ? (<strong>{member?.label ?? id}</strong>) : (<a href={`#/node/${id}`} onClick={(e) => {
                        e.preventDefault();
                        onSelect(id);
                    }}>
                  {member?.label ?? id}
                </a>)}
            </li>);
        })}
      </ol>
      
      <p class="hint">
        A ladder: reaching a rung means every rung above it holds too
        {group.subject ? (<>
            {" "}
            of a given <strong style={{ color: "var(--ink-1)" }}>{group.subject}</strong> —
            not of the developer as a whole.
          </>) : (".")}
      </p>
    </>);
}
function StackPlace({ graph, node, onSelect, }: {
    graph: Graph;
    node: IndexNode;
    onSelect: (id: string) => void;
}) {
    const byId = new Map(graph.index.components.map((c) => [c.id, c]));
    const chain: ComponentIndex[] = [];
    for (let at = byId.get(node.id)?.parent; at; at = byId.get(at)?.parent) {
        const parent = byId.get(at);
        if (!parent || chain.some((c) => c.id === parent.id))
            break;
        chain.unshift(parent);
    }
    const children = graph.index.components.filter((c) => c.parent === node.id);
    const jump = (c: ComponentIndex) => graph.byId.has(c.id) ? (<a href={`#/node/${c.id}`} onClick={(e) => {
            e.preventDefault();
            onSelect(c.id);
        }}>
        {c.label}
      </a>) : (<span>{c.label}</span>);
    return (<>
      {chain.length > 0 && (<p class="hint" style={{ marginTop: 2 }}>
          In the stack:{" "}
          {chain.map((c, i) => (<span key={c.id}>
              {i > 0 && " › "}
              {jump(c)}
            </span>))}
          {" › "}
          <strong style={{ color: "var(--ink-1)" }}>{node.label}</strong>
        </p>)}
      {children.length > 0 && (<p class="hint" style={{ marginTop: 2 }}>
          Contains:{" "}
          {children.map((c, i) => (<span key={c.id}>
              {i > 0 && " · "}
              {jump(c)}
            </span>))}
        </p>)}
    </>);
}
function Intro({ graph }: {
    graph: Graph;
}) {
    const s = graph.index.stats;
    return (<>
      <div class="kicker">How to read this</div>
      <h2>How the pathways connect</h2>
      <p>
        Read from left to right: <Term term="affordance">access and capabilities</Term>
        {" "}can enable <Term term="failure-mode">harmful actions</Term>. These actions can
        produce <Term term="condition">conditions</Term> that lead to an <Term term="outcome">outcome</Term>.
        {" "}<Term term="component">Components</Term> and <Term term="stage">stages</Term> provide context.
      </p>
      <p>
        Connections show <Term term="prerequisite">prerequisites</Term>. An AND gate means
        its inputs are needed together; separate groups represent alternatives.
        A declared gap means the map does not establish the full requirement.
      </p>
      <p>
        Select a node or connection to read its details. The Tutorial button at the top{" "}
        guides you through a case study and the map's tools.
      </p>
      
      <p>
        <strong>Map overview</strong> shows the broad range of pathways. Use <strong>Show context</strong>
        {" "}to reveal components and stages. Open a group to see its members, or choose
        <strong> Case studies</strong> to follow one example.
      </p>
      <p>
        {s.nodes} nodes · {s.edges} connections · {s.references} sources.
      </p>
      <p class="hint">
        Drag to pan, scroll or use the +/− buttons to zoom. Click the background, or press Escape,
        to put this panel away and give the picture the whole window; the ← and → buttons stay on
        the canvas and bring it back.
      </p>
    </>);
}
