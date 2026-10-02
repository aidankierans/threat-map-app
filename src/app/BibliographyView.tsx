import { editorLoginUrl } from "./hosting.js";
import type { ProseBundle } from "../types.js";
import { useEffect, useState } from "preact/hooks";
import { SharedEditor } from "./SharedEditor.js";
import { sharedRequest, type SharedCatalog, type SharedRevision } from "./shared-content.js";
export function BibliographyView({ prose, catalog, onPublished, requestedSource }: {
    prose: ProseBundle | null;
    catalog: SharedCatalog;
    onPublished: (r: SharedRevision) => void;
    requestedSource?: string;
}) {
    const [adding, setAdding] = useState(false);
    const [key, setKey] = useState("");
    const [fields, setFields] = useState({ title: "", url: "", authors: "", year: "", venue: "", urldate: "" });
    const [summary, setSummary] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!requestedSource || !prose)
            return;
        const target = document.getElementById(`source-${requestedSource}`);
        target?.scrollIntoView?.({ block: "start" });
        target?.focus();
    }, [requestedSource, prose]);
    const add = async (event: Event) => {
        event.preventDefault();
        setError("");
        if (prose?.references[key]) {
            setError("This citation key already exists. Edit that source instead.");
            return;
        }
        setBusy(true);
        try {
            const revision = await sharedRequest<SharedRevision>("", { resource: `bibliography/${key}`, parent: "base", fields, summary });
            onPublished(revision);
            setAdding(false);
            setKey("");
            setFields({ title: "", url: "", authors: "", year: "", venue: "", urldate: "" });
            setSummary("");
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <div class="doc"><h2>Bibliography</h2><p>Sources used throughout the map. Published edits and restores keep a revision history.</p>
    {catalog.editable && <button onClick={() => setAdding(!adding)}>{adding ? "Cancel new source" : "Add source"}</button>}
    {adding && <form onSubmit={add}><fieldset disabled={busy}><legend>New source</legend>
      <label>Citation key<input required pattern="[A-Za-z0-9_.:-]{1,200}" value={key} onInput={e => setKey(e.currentTarget.value)}/></label>
      {Object.entries(fields).map(([name, value]) => <label key={name}>{({ title: "Title", url: "Source URL", authors: "Authors", year: "Year", venue: "Publication", urldate: "Accessed date" } as Record<string, string>)[name]}<input required={name === "title"} type={name === "url" ? "url" : "text"} value={value} onInput={e => setFields({ ...fields, [name]: e.currentTarget.value })}/></label>)}
      <label>Describe the addition<input required maxLength={500} value={summary} onInput={e => setSummary(e.currentTarget.value)}/></label>
      <p>Publishing adds this source to the shared bibliography and records its first revision.</p>
      <button>Publish source</button>
    </fieldset></form>}
    {error && <p role="alert">{error}</p>}
    {catalog.mode === "local" ? <p>This preview shows bundled sources. Shared revisions and publishing are available on the authenticated site.</p> : !catalog.editable && !!editorLoginUrl("/") && <p><a href={editorLoginUrl("/?editor=1#/bibliography")}>Sign in as an editor</a> to publish changes.</p>}
    {!prose && <p>Loading sources…</p>}
    {Object.values(prose?.references ?? {}).sort((a, b) => a.key.localeCompare(b.key)).map(ref => <section key={ref.key} id={`source-${ref.key}`} tabIndex={-1} class="rq"><h3>{ref.title}</h3><dl class="reference-fields">
      {ref.authors && <><dt>Authors</dt><dd>{ref.authors}</dd></>}
      {ref.year && <><dt>Year</dt><dd>{ref.year}</dd></>}
      {ref.venue && <><dt>Publication</dt><dd>{ref.venue}</dd></>}
      <dt>Citation key</dt><dd><code>{ref.key}</code></dd>
      {/^https?:\/\//i.test(ref.url) && <><dt>Source</dt><dd><a href={ref.url} target="_blank" rel="noreferrer">{ref.url}</a></dd></>}
      {ref.urldate && <><dt>Accessed</dt><dd>{ref.urldate}</dd></>}
    </dl>
      <SharedEditor resource={`bibliography/${ref.key}`} editable={catalog.editable} current={catalog.revisions.find(r => r.resource === `bibliography/${ref.key}`)} fields={{ title: ref.title, url: ref.url, authors: ref.authors ?? "", year: ref.year ?? "", venue: ref.venue ?? "", urldate: ref.urldate ?? "" }} onPublished={onPublished}/>
    </section>)}
  </div>;
}
