import { useState } from "preact/hooks";
import { SharedRequestError, sharedRequest, type SharedFields, type SharedRevision } from "./shared-content.js";
interface Props {
    resource: string;
    fields: SharedFields;
    current?: SharedRevision;
    editable: boolean;
    onPublished: (revision: SharedRevision) => void;
}
export function SharedEditor({ resource, fields, current, editable, onPublished }: Props) {
    const [draft, setDraft] = useState<SharedFields | null>(null);
    const [parent, setParent] = useState("base");
    const [summary, setSummary] = useState("");
    const [restore, setRestore] = useState<string | undefined>();
    const [history, setHistory] = useState<SharedRevision[] | null>(null);
    const [original, setOriginal] = useState<SharedFields | null>(null);
    const [next, setNext] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const edit = (value: SharedFields, message = "", restored?: string) => { setDraft({ ...value }); setParent(current?.id ?? "base"); setSummary(message); setRestore(restored); setError(""); setConflict(false); };
    const revisions = async (more = false) => {
        setBusy(true);
        setError("");
        try {
            const data = await sharedRequest<{
                revisions: SharedRevision[];
                next: number | null;
                original?: SharedFields;
            }>(`?resource=${encodeURIComponent(resource)}${more && next ? `&before=${next}` : ""}`);
            setHistory(more ? [...history ?? [], ...data.revisions] : data.revisions);
            setNext(data.next);
            if (data.original)
                setOriginal(data.original);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    const publish = async (event: Event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const revision = await sharedRequest<SharedRevision>("", { resource, parent, fields: draft, summary, ...(restore ? { restore } : {}) });
            onPublished(revision);
            setDraft(null);
            setHistory(null);
        }
        catch (e) {
            setError(String(e));
            setConflict(e instanceof SharedRequestError && e.status === 409);
        }
        finally {
            setBusy(false);
        }
    };
    return <div class="shared-editor">
    {current && <small>Shared revision · {new Date(current.created).toLocaleString()} · {current.author}</small>}
    <div class="case-actions">{editable && !draft && <button onClick={() => edit(fields)}>Edit</button>}<button disabled={busy} onClick={() => history ? setHistory(null) : void revisions()}>{history ? "Hide revision history" : "Revision history"}</button></div>
    {draft && <form onSubmit={publish}><fieldset disabled={busy}><p>Changes publish to the shared map for everyone. Previous revisions remain available.</p>
      {Object.entries(draft).map(([key, value]) => <label key={key}>{key === "body" ? "Text (Markdown)" : key === "addresses" ? "Related map node IDs (comma-separated)" : key}<textarea required={key === "title"} value={value} onInput={e => setDraft({ ...draft, [key]: e.currentTarget.value })}/></label>)}
      <label>Describe your changes<input required maxLength={500} value={summary} onInput={e => setSummary(e.currentTarget.value)}/></label>
      <button disabled={busy || conflict}>Publish revision</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setConflict(false); }}>Cancel</button>
    </fieldset></form>}
    {history && <div><h4>Revision history</h4>{history.length === 0 && <p>No published edits yet.</p>}{history.map(rev => <details key={rev.id}><summary>{new Date(rev.created).toLocaleString()} — {rev.summary}</summary><p>{rev.author}</p>{Object.entries(rev.fields).map(([key, value]) => <p class="case-prose"><strong>{key}:</strong> {value}</p>)}{editable && <button onClick={() => edit(rev.fields, `Restore revision from ${rev.created}`, rev.id)}>Review restore</button>}</details>)}{next && <button disabled={busy} onClick={() => void revisions(true)}>Older revisions</button>}{original && <details><summary>Original published content</summary>{Object.entries(original).map(([key, value]) => <p class="case-prose"><strong>{key}:</strong> {value}</p>)}{editable && <button onClick={() => edit(original, "Restore original published content", "base")}>Review restore</button>}</details>}</div>}
    {error && <p role="alert">{error}</p>}
    {conflict && <div><p>Your draft is retained above. Review the latest published text in revision history before combining the changes.</p><button disabled={busy} onClick={() => void revisions()}>Load latest revision for comparison</button>{history?.[0] && history[0].id !== parent && <button onClick={() => { setParent(history[0].id); onPublished(history[0]); setConflict(false); setError(""); }}>I have reconciled my draft with this revision</button>}</div>}
  </div>;
}
