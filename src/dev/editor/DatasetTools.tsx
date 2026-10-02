import { useEffect, useState } from 'preact/hooks';
import type { AnalysisDocument } from '../../app/reader-state.js';
import type { EditorContext } from './api.js';
export async function localRequest(ctx: EditorContext, path: string, body?: unknown) {
    const response = await fetch(`${import.meta.env.BASE_URL}__editor/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-editor-token': ctx.token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok)
        throw Error(result.error ?? 'Local file operation failed.');
    return result;
}
const prefixes: Record<string, string> = { component: 'CMP', stage: 'S', affordance: 'AF', 'failure-mode': 'FM', condition: 'CD', event: 'E', 'condition-group': 'CG', 'act-class': 'AC', consequence: 'C', question: 'Q' };
const groupMember: Record<string, string> = { 'condition-group': 'condition', 'act-class': 'failure-mode', consequence: 'event' };
export function DatasetTools({ ctx, onOpen }: {
    ctx: EditorContext;
    onOpen: (doc: AnalysisDocument) => void;
}) {
    const [mode, setMode] = useState<'node' | 'group' | 'drafts' | null>(null);
    const [options, setOptions] = useState<{
        layers: Record<string, {
            label: string;
        }>;
        gates: Record<string, string[]>;
    } | null>(null);
    const [drafts, setDrafts] = useState<AnalysisDocument[]>([]);
    const [layer, setLayer] = useState('component'), [id, setId] = useState(''), [label, setLabel] = useState(''), [body, setBody] = useState('');
    const [selected, setSelected] = useState<string[]>([]), [group, setGroup] = useState(''), [parent, setParent] = useState('');
    const [kind, setKind] = useState('classifying'), [subject, setSubject] = useState(''), [phase, setPhase] = useState('A'), [bucket, setBucket] = useState('assessment');
    const [partial, setPartial] = useState(false), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { localRequest(ctx, 'create-options').then(setOptions).catch(e => setError(e.message)); }, []);
    const open = (next: typeof mode) => { setMode(next); setError(''); setSelected([]); setGroup(''); setId(''); setLabel(''); setBody(''); setLayer(next === 'group' ? 'act-class' : 'component'); if (next === 'drafts')
        localRequest(ctx, 'case-drafts').then(v => setDrafts(v.drafts)).catch(e => setError(e.message)); };
    const groups = ctx.index.groups.filter(g => groupMember[g.layer] === layer);
    const isGroup = mode === 'group';
    const choices = ctx.index.nodes.filter(n => isGroup ? n.layer === groupMember[layer] : (options?.gates[layer] ?? []).includes(n.layer));
    const create = async (e: Event) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError('');
        const meta: Record<string, unknown> = { id, label, layer, status: 'draft', provenance: 'human-written', cites: [], needs_citation: false };
        if (isGroup)
            Object.assign(meta, { kind, members: selected, ...(layer === 'condition-group' ? { subject } : {}) });
        else {
            if (['stage', 'affordance', 'failure-mode', 'condition', 'event'].includes(layer))
                meta.evidence_bucket = bucket;
            if (layer === 'stage')
                meta.phase = phase;
            if (layer === 'component' && parent)
                meta.parent = parent;
            if (options?.gates[layer])
                meta.enabled_by = selected.length ? [{ all: selected, ...(note ? { note } : {}), ...(partial ? { partial: true } : {}) }] : [];
        }
        try {
            const result = await localRequest(ctx, 'create', { meta, body, ...(groups.length ? { group } : {}) });
            setError(`Created ${result.sources.join(', ')}`);
            setMode(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <section class="local-dataset-tools">
   <button class="btn" onClick={() => open('node')}>Add node</button> <button class="btn" onClick={() => open('group')}>Add group</button> <button class="btn" onClick={() => open('drafts')}>Recover local case draft</button>
   {error && !mode && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
   {mode && <div class="edt-form local-dataset-panel" role="region" aria-label="Local dataset editor"><button onClick={() => setMode(null)}>Close</button>{error && <p role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
   {mode === 'drafts' ? <><h3>Case recovery files on this computer</h3><p>Saved revisions are listed in Case studies. These are the latest working drafts from disk.</p>{drafts.length ? drafts.map(d => <p key={d.identity.analysisId}><button onClick={() => { onOpen(d); setMode(null); }}>{d.content.title}</button></p>) : <p>No local recovery files yet.</p>}</> : <form onSubmit={create}>
     <h3>{isGroup ? 'Add a group' : 'Add a node'}</h3><p>Creates Markdown in this dataset's content folder. Existing files are validated before the change is applied.</p>
     <label>Type <select value={layer} onChange={e => { setLayer(e.currentTarget.value); setSelected([]); setGroup(''); setId(''); }}>{Object.keys(prefixes).filter(k => isGroup ? !!groupMember[k] : !groupMember[k]).filter(k => options?.layers[k]).map(k => <option value={k}>{options!.layers[k].label}</option>)}</select></label>
     <label>Label <input required value={label} onInput={e => { setLabel(e.currentTarget.value); if (!id || id === `${prefixes[layer]}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`)
                setId(`${prefixes[layer]}-${e.currentTarget.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`); }}/></label>
     <label>Unique ID <input required pattern="[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*" value={id} placeholder={`${prefixes[layer]}-example`} onInput={e => setId(e.currentTarget.value)}/></label>
     <label>Description (Markdown) <textarea value={body} onInput={e => setBody(e.currentTarget.value)} rows={5}/></label>
     {isGroup && <><label>Group semantics <select value={kind} onChange={e => setKind(e.currentTarget.value)}><option value="classifying">Classifying: related items</option><option value="partition">Partition: mutually exclusive alternatives</option><option value="scale">Scale: ordered levels</option></select></label>{layer === 'condition-group' && <label>What question does this group answer? <input required value={subject} onInput={e => setSubject(e.currentTarget.value)}/></label>}<p>Selected nodes move from their existing groups. Every existing group must retain its minimum membership. Scale members use the order in which you select them.</p></>}
     {!isGroup && groups.length > 0 && <label>Group <select required value={group} onChange={e => setGroup(e.currentTarget.value)}><option value="">Choose a group</option>{groups.map(g => <option value={g.id}>{g.label}</option>)}</select></label>}
     {layer === 'component' && <label>Parent component (optional) <select value={parent} onChange={e => setParent(e.currentTarget.value)}><option value="">None</option>{ctx.index.components.map(c => <option value={c.id}>{c.label}</option>)}</select></label>}
     {layer === 'stage' && <label>Phase <select value={phase} onChange={e => setPhase(e.currentTarget.value)}>{['A', 'B', 'C', 'D', 'E', 'F', 'X'].map(p => <option value={p}>{ctx.index.taxonomies.phase.values[p]?.label ?? p}</option>)}</select></label>}
     {!isGroup && ['stage', 'affordance', 'failure-mode', 'condition', 'event'].includes(layer) && <label>Evidence category <select value={bucket} onChange={e => setBucket(e.currentTarget.value)}>{['assessment', 'eval', 'private', 'hard'].map(b => <option value={b}>{ctx.index.taxonomies.evidence_bucket.values[b]?.label ?? b}</option>)}</select></label>}
     {choices.length > 0 && <fieldset style={{ maxHeight: '18rem', overflow: 'auto' }}><legend>{isGroup ? 'Members' : 'Prerequisites (all selected items must hold)'}</legend>{choices.map(n => <label style={{ display: 'block' }}><input type="checkbox" checked={selected.includes(n.id)} onChange={e => setSelected(e.currentTarget.checked ? [...selected, n.id] : selected.filter(id => id !== n.id))}/>{n.label} ({n.id})</label>)}</fieldset>}
     {!isGroup && options?.gates[layer] && <><label><input type="checkbox" checked={partial} onChange={e => setPartial(e.currentTarget.checked)}/>Prerequisites are incomplete</label><label>Prerequisite explanation <textarea required={partial} value={note} onInput={e => setNote(e.currentTarget.value)}/></label><p>You can add alternative prerequisite groups using the node editor after creation.</p></>}
     <button type="submit" disabled={busy || !options}>{busy ? 'Creating…' : isGroup ? 'Create group' : 'Create node'}</button>
   </form>}</div>}
 </section>;
}
