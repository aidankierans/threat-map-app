import { useEffect, useState } from "preact/hooks";
import { sharedRequest, type SharedRevision } from "./shared-content.js";
import type { MapRevision } from "../shared-map.js";
import { mapRequest, exportMapRevision } from "./shared-map-api.js";
type Entry = {
    id: string;
    created: string;
    author: string;
    summary: string;
    resource: string;
    operation: string;
    kind: "map" | "content";
    details: MapRevision | SharedRevision;
};
const emptyFilters = { author: "", resource: "", q: "", from: "", to: "", operation: "" };
type Filters = typeof emptyFilters;
export function ChangeLog({ onClose, onRestore }: {
    onClose: () => void;
    onRestore: (id: string) => void;
}) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [cursors, setCursors] = useState<{
        map: number | null;
        content: number | null;
    }>({ map: null, content: null });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [filters, setFilters] = useState(emptyFilters);
    const [applied, setApplied] = useState(emptyFilters);
    const load = async (more = false, selection: Filters = applied) => {
        setBusy(true);
        setError("");
        try {
            const params = new URLSearchParams({ log: "1" });
            for (const [key, value] of Object.entries(selection))
                if (value.trim())
                    params.set(key, value.trim());
            const [map, content] = await Promise.all([
                more && cursors.map === null ? null : mapRequest<{
                    revisions: MapRevision[];
                    next: number | null;
                }>(`?${params}${more ? `&before=${cursors.map}` : ""}`),
                more && cursors.content === null ? null : sharedRequest<{
                    revisions: SharedRevision[];
                    next: number | null;
                }>(`?${params}${more ? `&before=${cursors.content}` : ""}`),
            ]);
            const additions: Entry[] = [
                ...(map?.revisions ?? []).map(r => ({ ...r, kind: "map" as const, operation: r.restore ? "restore" : r.rebased ? "rebase" : "revise", resource: `Map: ${r.changes.map(c => c.id).join(", ") || "base revision"}`, details: r })),
                ...(content?.revisions ?? []).map(r => ({ ...r, kind: "content" as const, operation: r.operation ?? "unknown", details: r })),
            ];
            setEntries(previous => [...(more ? previous : []), ...additions].sort((a, b) => b.created.localeCompare(a.created)));
            setCursors({ map: map?.next ?? null, content: content?.next ?? null });
            setApplied({ ...selection });
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    useEffect(() => { void load(); }, []);
    const exportLog = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ exported: new Date().toISOString(), filters: applied, complete: !cursors.map && !cursors.content, entries }, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "map-change-log.json";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <section class="doc admin-console" aria-label="Master change log"><h2>Master change log</h2><button onClick={onClose}>Close change log</button>
    <p>Map and bibliography revisions, newest first. Restores create new revisions; previous records remain available.</p>
    <form class="shared-editor" onSubmit={event => { event.preventDefault(); void load(false, filters); }}><fieldset disabled={busy}><legend>Search all revisions</legend>
      {([["author", "Editor"], ["resource", "Resource ID"], ["q", "Change summary"], ["from", "From date (UTC)"], ["to", "Through date (UTC)"]] as const).map(([key, label]) => <label key={key}>{label}<input type={key === "from" || key === "to" ? "date" : "text"} maxLength={500} value={filters[key]} onInput={event => setFilters({ ...filters, [key]: event.currentTarget.value })}/></label>)}
      <label>Operation<select aria-label="Operation" value={filters.operation} onChange={event => setFilters({ ...filters, operation: event.currentTarget.value })}>
        <option value="">All operations</option><option value="create">Creation</option><option value="revise">Revision</option><option value="restore">Restoration</option><option value="rebase">Deployment update</option><option value="unknown">Unknown (older records)</option>
      </select></label>
      <button>Apply filters</button><button type="button" onClick={() => { setFilters(emptyFilters); void load(false, emptyFilters); }}>Clear filters</button>
    </fieldset></form>
    <p>Dates include the whole UTC day. Older bibliography records may have an unknown operation. Export includes the applied filters and indicates whether all matching pages have loaded.</p>
    {JSON.stringify(filters) !== JSON.stringify(applied) && <p>Filter changes have not been applied. Results still use the previous filters.</p>}
    <button disabled={busy} onClick={() => void load()}>Refresh</button><button disabled={busy || !!error || !entries.length} onClick={exportLog}>Export loaded log</button>
    {busy && <p role="status">Loading revisions…</p>}{error && <p role="alert">{error}</p>}
    {!busy && !error && !entries.length && <p>{Object.values(applied).some(Boolean) ? "No revisions match these filters." : "No shared revisions yet."}</p>}
    {entries.map(e => <details key={`${e.kind}:${e.id}`}><summary>{new Date(e.created).toLocaleString()} · {e.summary}</summary><p>{e.author} · {e.resource} · {e.operation}</p>
      {e.details.restore && <p>Restores: {e.details.restore}</p>}
      {e.kind === "map" ? <>
        {(e.details as MapRevision).changes.map(change => <div key={change.id}><a href={`#/node/${encodeURIComponent(change.id)}`} onClick={onClose}>{change.id}</a><h4>Before</h4><pre>{JSON.stringify(change.before, null, 2)}</pre><h4>After</h4><pre>{JSON.stringify(change.after, null, 2)}</pre></div>)}
        <button onClick={() => onRestore(e.id)}>Review restore</button><button onClick={() => void exportMapRevision(e.id).catch(error => setError(String(error)))}>Export map checkpoint</button>
      </> : <>
        <pre>{JSON.stringify((e.details as SharedRevision).fields, null, 2)}</pre>
        {e.resource.startsWith("bibliography/") && <a href={`#/bibliography/${encodeURIComponent(e.resource.slice("bibliography/".length))}`} onClick={onClose}>Open source and revision history</a>}
      </>}
    </details>)}
    {entries.some(e => e.kind === "map") && <button onClick={() => onRestore("base")}>Review original map restoration</button>}
    {(cursors.map || cursors.content) && <button disabled={busy} onClick={() => void load(true)}>Load older revisions</button>}
  </section>;
}
