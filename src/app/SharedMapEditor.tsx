import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import { clearMapDraft, readMapDraft, saveMapDraft } from "./map-drafts.js";
import type { MapCatalog, MapDocument, MapFields, MapPreview, MapWrite } from "../shared-map.js";
import { MapRequestError, loadMapDocument, previewMapChanges, publishMapChanges, loadSharedMap } from "./shared-map-api.js";
import { buildGraph } from "./selectors.js";
import { GraphCanvas } from "./Graph.js";
import "../styles/map-editor.css";
interface Props {
    id: string;
    onPublished: (catalog: MapCatalog) => void;
    onClose?: () => void;
}
export function MapRevisionPreview({ preview }: {
    preview: MapPreview;
}) {
    const graph = useMemo(() => buildGraph(preview.index), [preview.index]);
    const ids = useMemo(() => new Set(preview.changes.flatMap(c => [c.id, ...(preview.index.gates[c.id] ?? []).flatMap(g => g.all), ...preview.index.edges.filter(e => e.from === c.id).map(e => e.to)])), [preview]);
    const view = useMemo(() => buildGraph(preview.index, [], n => ids.has(n.id)), [preview, ids]);
    return <section class="map-revision-preview" aria-label="Map revision preview">
    <h3>Preview for everyone</h3>
    <p>{preview.changes.length} documents changed. The map below shows their immediate connections.</p>
    {view.drawn.size > 0 && <div style={{ height: "320px", position: "relative", display: "flex" }}><GraphCanvas graph={view} visible={view.drawn} hits={new Set(preview.changes.map(c => c.id))} held={new Set()} selection={[]} onSelect={() => { }} onClear={() => { }} onHover={() => { }} partialGates/></div>}
    {preview.changes.map(change => <details open key={change.id}><summary>{graph.byId.get(change.id)?.label ?? change.id}</summary><div class="map-change-comparison"><section><h4>Before</h4><pre>{JSON.stringify(change.before, null, 2)}</pre></section><section><h4>After</h4><pre>{JSON.stringify(change.after, null, 2)}</pre></section></div>{preview.prose.docs[change.id] && <section aria-label="Rendered document" dangerouslySetInnerHTML={{ __html: preview.prose.docs[change.id].html }}/>}</details>)}
    {(preview.deploymentConflicts?.length ?? 0) > 0 && <section><h3>Published edits that differ from this deployment</h3>{preview.deploymentConflicts!.map(change => <details open key={change.id}><summary>{change.id}</summary><div class="map-change-comparison"><section><h4>New bundled content</h4><pre>{JSON.stringify(change.before, null, 2)}</pre></section><section><h4>Retained published edits</h4><pre>{JSON.stringify(change.after, null, 2)}</pre></section></div></details>)}</section>}
    {preview.warnings.length > 0 && <details><summary>Content review notes ({preview.warnings.length})</summary><ul>{preview.warnings.map(message => <li>{message}</li>)}</ul></details>}
  </section>;
}
export function SharedMapEditor({ id: initialId, onPublished, onClose }: Props) {
    const [id, setId] = useState(initialId);
    const [recovered, setRecovered] = useState(false);
    const [storageFailed, setStorageFailed] = useState(false);
    useEffect(() => { setId(initialId); }, [initialId]);
    const [document, setDocument] = useState<MapDocument | null>(null);
    const [fields, setFields] = useState<MapFields>({});
    const [gates, setGates] = useState("[]");
    const [summary, setSummary] = useState("");
    const [preview, setPreview] = useState<MapPreview | null>(null);
    const [prepared, setPrepared] = useState<Omit<MapWrite, "action"> | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const showError = (error: unknown) => { setError(error instanceof MapRequestError ? [error.message, ...error.errors].join("\n") : String(error)); setConflict(error instanceof MapRequestError && error.status === 409); };
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError("");
        setDocument(null);
        setPreview(null);
        setConflict(false);
        void loadMapDocument(id).then(doc => { if (active) {
            const draft = readMapDraft(id);
            setDocument(draft ? { ...doc, head: draft.document.head, baseRevision: draft.document.baseRevision, fields: draft.document.fields } : doc);
            setFields(draft?.fields ?? doc.fields);
            setGates(draft?.gates ?? JSON.stringify(doc.fields.enabled_by ?? [], null, 2));
            setSummary(draft?.summary ?? "");
            setRecovered(!!draft);
            if (draft && (draft.document.head !== doc.head || draft.document.baseRevision !== doc.baseRevision)) {
                setConflict(true);
                setError("Your recovered draft began before the latest published revision. Load the latest revision to compare before previewing.");
            }
        } }).catch(e => { if (active)
            showError(e); }).finally(() => { if (active)
            setBusy(false); });
        return () => { active = false; };
    }, [id]);
    const dirty = !!document && (JSON.stringify(fields) !== JSON.stringify(document.fields) || gates !== JSON.stringify(document.fields.enabled_by ?? [], null, 2) || !!summary);
    useLayoutEffect(() => {
        if (!document || document.id !== id || busy)
            return;
        if (!dirty) {
            clearMapDraft(id);
            return;
        }
        setStorageFailed(!saveMapDraft({ document, fields, gates, summary }));
    }, [document, id, fields, gates, summary, busy, dirty]);
    const change = (patch: Partial<MapFields>) => { setFields(value => ({ ...value, ...patch })); setPreview(null); setPrepared(null); };
    const prepare = async (rebase = false) => {
        if (!document)
            return;
        setBusy(true);
        setError("");
        setPreview(null);
        try {
            const candidate = { ...fields, ...(document.editableFields.includes("enabled_by") ? { enabled_by: JSON.parse(gates) } : {}) };
            const patch = Object.fromEntries(Object.entries(candidate).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(document.fields[key as keyof MapFields]))) as MapFields;
            const request = { parent: document.head, baseRevision: document.baseRevision, summary: summary.trim(), changes: Object.keys(patch).length ? [{ id, fields: patch }] : [], ...(rebase ? { rebase: true } : {}) };
            const result = await previewMapChanges(request);
            setPreview(result);
            setPrepared({ ...request, preview: result.preview });
            setConflict(false);
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy(false);
        }
    };
    const publish = async () => {
        if (!prepared)
            return;
        setBusy(true);
        setError("");
        try {
            const catalog = await publishMapChanges(prepared);
            clearMapDraft(id);
            onPublished(catalog);
            setPreview(null);
            setPrepared(null);
            const doc = await loadMapDocument(id);
            setDocument(doc);
            setFields(doc.fields);
            setGates(JSON.stringify(doc.fields.enabled_by ?? [], null, 2));
            setSummary("");
            setRecovered(false);
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <section class="shared-map-editor shared-editor" aria-label="Shared map editor">
    <div class="case-actions"><h2>Edit canonical map</h2>{onClose && <button class="btn" onClick={onClose}>Close editor</button>}</div>
    <p>Changes update the map for all readers. Case-specific labels and notes belong in the case study editor.</p>
    {busy && !document && <p role="status">Loading current map source…</p>}
    {document && <form onSubmit={e => { e.preventDefault(); void prepare(); }}><fieldset disabled={busy}>
      <label>Map document<select value={id} onChange={e => { if (dirty)
            saveMapDraft({ document, fields, gates, summary }); setId(e.currentTarget.value); }}>{document.nodes.map(node => <option key={node.id} value={node.id}>{node.label} ({node.id})</option>)}</select></label>
      {(dirty || recovered) && <p role="status">{storageFailed ? "Browser draft storage is unavailable. Keep this editor open or copy your changes before leaving." : recovered ? "Recovered your unpublished draft from this browser. Review it before publishing." : "Your unpublished draft is saved in this browser."}</p>}
      {(dirty || recovered) && <button class="btn" type="button" onClick={() => { setBusy(true); void loadMapDocument(id).then(doc => { clearMapDraft(id); setDocument(doc); setFields(doc.fields); setGates(JSON.stringify(doc.fields.enabled_by ?? [], null, 2)); setSummary(""); setRecovered(false); setPreview(null); setPrepared(null); setConflict(false); setError(""); }).catch(showError).finally(() => setBusy(false)); }}>Discard local draft and load published version</button>}
      <p>{document.fields.label ?? id} <small>({id})</small></p>
      {document.baseChanged && <p role="status">A new bundled map was deployed. Published edits remain visible. Review the deployment update before publishing further edits.</p>}
      <label>Label<input value={fields.label ?? ""} onInput={e => change({ label: e.currentTarget.value })}/></label>
      <label>Text (Markdown)<textarea value={fields.body ?? ""} onInput={e => change({ body: e.currentTarget.value })}/></label>
      <label>Citation keys (comma-separated)<input value={(fields.cites ?? []).join(", ")} onInput={e => change({ cites: e.currentTarget.value.split(",").map(s => s.trim()).filter(Boolean) })}/></label>
      <label>Evidence status<select value={fields.status ?? "draft"} onChange={e => change({ status: e.currentTarget.value as MapFields["status"] })}>{["draft", "reviewed", "verified"].map(status => <option value={status}>{status}</option>)}</select></label>
      <label>Authorship<select value={fields.provenance ?? "ai-drafted"} onChange={e => change({ provenance: e.currentTarget.value as MapFields["provenance"] })}>{["ai-drafted", "human-written", "human-verified"].map(value => <option value={value}>{value}</option>)}</select></label>
      <label><input type="checkbox" checked={fields.needs_citation ?? false} onChange={e => change({ needs_citation: e.currentTarget.checked })}/> Citation still needed</label>
      {document.editableFields.includes("enabled_by") && <fieldset><legend>Prerequisite alternatives</legend><p>Each group lists conditions that must all hold. Separate groups are alternatives. A partial group needs a note explaining what is missing.</p><label>Groups (JSON)<textarea aria-label="Prerequisite groups" value={gates} onInput={e => { setGates(e.currentTarget.value); setPreview(null); setPrepared(null); }}/></label><details><summary>Node IDs for prerequisites</summary>{document.nodes.map(node => <p><code>{node.id}</code> — {node.label}</p>)}</details></fieldset>}
      <label>Describe your changes<input required maxLength={500} value={summary} onInput={e => { setSummary(e.currentTarget.value); setPreview(null); setPrepared(null); }}/></label>
      {!document.baseChanged && <button class="btn" disabled={busy || conflict || !summary.trim()}>Preview changes</button>}
      {document.baseChanged && <button class="btn" type="button" disabled={busy || !summary.trim()} onClick={() => void prepare(true)}>Preview deployment update and edits</button>}
    </fieldset></form>}
    {preview && <><MapRevisionPreview preview={preview}/><button class="btn" disabled={busy || conflict} onClick={() => void publish()}>Publish these changes</button></>}
    {error && <p class="case-prose" role="alert">{error}</p>}
    {conflict && <button class="btn" disabled={busy} onClick={() => {
                void loadMapDocument(id).then(doc => {
                    const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(document?.fields[key as keyof MapFields])));
                    setFields({ ...doc.fields, ...changed });
                    if (gates === JSON.stringify(document?.fields.enabled_by ?? [], null, 2))
                        setGates(JSON.stringify(doc.fields.enabled_by ?? [], null, 2));
                    setDocument(doc);
                    setConflict(false);
                    setPreview(null);
                    setPrepared(null);
                    setError("Latest revision loaded. Your draft is retained; compare it with the published map before previewing again.");
                }).catch(showError);
            }}>Load latest revision and retain my draft</button>}
  </section>;
}
export function MapRestoreReview({ revisionId, onPublished, onClose }: {
    revisionId: string;
    onPublished: (catalog: MapCatalog) => void;
    onClose: () => void;
}) {
    const [preview, setPreview] = useState<MapPreview | null>(null);
    const [request, setRequest] = useState<Omit<MapWrite, "action"> | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; setBusy(true); void (async () => { try {
        const current = await loadSharedMap();
        const input = { parent: current.head, baseRevision: current.baseRevision, summary: `Restore map revision ${revisionId}`, restore: revisionId, changes: [] };
        const next = await previewMapChanges(input);
        if (active) {
            setPreview(next);
            setRequest({ ...input, preview: next.preview });
        }
    }
    catch (e) {
        if (active)
            setError(String(e));
    }
    finally {
        if (active)
            setBusy(false);
    } })(); return () => { active = false; }; }, [revisionId]);
    return <section class="shared-map-editor shared-editor"><h2>Review map restoration</h2><p>This restores the map documents to the selected checkpoint, including reversing later edits shown below. Publishing creates a new revision and retains the full history. Bibliography entries keep their current revisions.</p>{preview && <MapRevisionPreview preview={preview}/>}{error && <p role="alert">{error}</p>}<button class="btn" disabled={busy || !request} onClick={() => { if (!request)
        return; setBusy(true); void publishMapChanges(request).then(onPublished).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>Publish restoration</button><button class="btn" onClick={onClose}>Cancel restoration</button></section>;
}
