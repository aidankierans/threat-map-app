import { editorLoginUrl, hosting } from "./hosting.js";
import type { EvidenceBucket, ProseBundle } from "../types.js";
import { useRef } from "preact/hooks";
import type { FilterState, Graph } from "./selectors.js";
import { REPO_SOURCE_BASE } from "./config.js";
import { DocHistoryButtons } from "./DocHistory.js";
import { lazyFeature } from "./lazy-feature.js";
import { Facet, optionsOf, toggle, useCloseMenus } from "./Filters.js";
import { ProseBody, type EditableProse } from "./ProseBody.js";
import { StatusChip } from "./Panel.js";
import type { HistoryNav } from "./history.js";
import { SharedEditor } from "./SharedEditor.js";
import { plainText, type SharedCatalog, type SharedRevision } from "./shared-content.js";
const FeedbackForm = lazyFeature(async () => ({ default: (await import("./FeedbackForm.js")).FeedbackForm }), "feedback form");
interface ViewProps {
    graph: Graph;
    prose: ProseBundle | null;
    nav: HistoryNav;
    onSelectNode: (id: string) => void;
    editable?: EditableProse;
}
export function QuestionsView({ graph, prose, nav, onSelectNode, editable, filters, onChange, catalog, onPublished, }: ViewProps & {
    catalog?: SharedCatalog;
    onPublished?: (r: SharedRevision) => void;
    filters: FilterState;
    onChange: (patch: Partial<FilterState>) => void;
}) {
    const tax = graph.index.taxonomies;
    const headRef = useRef<HTMLDivElement>(null);
    useCloseMenus(headRef);
    const buckets = optionsOf(tax.evidence_bucket);
    const on = filters.bucket ?? buckets.map((o) => o.value);
    const questions = graph.index.questions.filter((q) => !q.bucket || on.includes(q.bucket));
    const total = graph.index.questions.length;
    return (<div class="doc">
      <DocHistoryButtons graph={graph} nav={nav}/>
      <h2>Self-contained research questions</h2>
      {catalog && !catalog.editable && !!editorLoginUrl("/") && <p><a href={editorLoginUrl("/?editor=1#/questions")}>Sign in as an editor</a> to publish changes. Earlier revisions remain available to restore.</p>}
      <p>
        Each question names the nodes it would help settle. Clicking one opens that node on the
        event tree, so a gap in the evidence and the place it bites are one click apart.
      </p>

      
      <div class="docfilter" ref={headRef}>
        <Facet id="f-qbucket" label="Evidence bucket" tip="Keep only the questions whose evidence is of the kinds you tick — the same facet the event tree carries, so it narrows the map too" options={buckets} checked={on} onToggle={(value) => onChange({ bucket: toggle(on, value, buckets) as EvidenceBucket[] | null })} onAll={() => onChange({ bucket: null })} onNone={() => onChange({ bucket: [] })}/>
        <span class="hint">
          {questions.length === total
            ? `${total} questions`
            : `${questions.length} of ${total} questions`}
        </span>
      </div>

      
      {questions.length === 0 && (<p class="hint">
          No question is in the buckets you have ticked. Open the facet above and press{" "}
          <strong>All</strong> to get the list back.
        </p>)}

      {questions.map((q) => {
            const doc = prose?.docs[q.id];
            return (<div class="rq" key={q.id}>
            <h3>
              {q.order}. {q.label}
            </h3>
            <div class="chips">
              {q.bucket && (<span class="chip" title={tax.evidence_bucket.values[q.bucket]?.tip}>
                  {tax.evidence_bucket.values[q.bucket]?.short ?? q.bucket}
                </span>)}
              <StatusChip status={q.status} provenance={q.provenance} taxonomies={tax}/>
            </div>

            <ProseBody id={q.id} html={doc?.html} fallback={<p class="hint">Loading…</p>} editable={editable}/>
            {catalog && onPublished && doc && <SharedEditor resource={`questions/${q.id}`} editable={catalog.editable} current={catalog.revisions.find(r => r.resource === `questions/${q.id}`)} fields={{ title: q.label, body: doc.markdown ?? plainText(doc.html), addresses: q.addresses.join(", "), bucket: q.bucket ?? "" }} onPublished={onPublished}/>}

            {q.addresses.length > 0 && (<p>
                <strong>Would settle:</strong>{" "}
                {q.addresses.map((id, i) => {
                        const node = graph.byId.get(id);
                        return (<span key={id}>
                      {i > 0 && " · "}
                      <a href={`#/node/${id}`} onClick={(e) => {
                                e.preventDefault();
                                onSelectNode(id);
                            }}>
                        {node ? `${id} — ${node.label}` : id}
                      </a>
                    </span>);
                    })}
              </p>)}

            {REPO_SOURCE_BASE && <a class="sourcelink" href={`${REPO_SOURCE_BASE}/${q.source}`} target="_blank" rel="noopener">
              View original source · {q.source}
            </a>}
          </div>);
        })}
    </div>);
}
export function PageView({ graph, prose, nav, slug, editable, }: {
    graph: Graph;
    prose: ProseBundle | null;
    nav: HistoryNav;
    slug: string;
    editable?: EditableProse;
}) {
    const page = graph.index.pages.find((p) => p.slug === slug);
    if (!page) {
        return (<div class="doc">
        <DocHistoryButtons graph={graph} nav={nav}/>
        <h2>Page not found</h2>
        <p class="hint">No page with slug "{slug}".</p>
      </div>);
    }
    const doc = prose?.docs[page.id];
    return (<div class="doc">
      <DocHistoryButtons graph={graph} nav={nav}/>
      <h2>{page.label}</h2>
      <ProseBody id={page.id} html={doc?.html} fallback={<p class="loading">Loading…</p>} editable={editable}/>
      
      {page.widget === "feedback-form" && hosting().capabilities.feedback && <FeedbackForm />}
      {REPO_SOURCE_BASE && <a class="sourcelink" href={`${REPO_SOURCE_BASE}/${page.source}`} target="_blank" rel="noopener">
        View source · {page.source}
      </a>}
    </div>);
}
