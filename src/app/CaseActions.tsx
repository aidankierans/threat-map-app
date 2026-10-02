import { hosting } from "./hosting.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AnalysisDocument, ReaderState } from "./reader-state.js";
import type { CaseAction } from "./case-edit.js";
import { caseShareLink } from "./case-route.js";
import { downloadCase, prepareCase, saveCase } from "./case-store.js";
import { publishCase } from "./case-api.js";
import type { GraphIndex, ProseBundle } from '../types.js';
import { bundleCase } from './portable-map.js';
import { parseCase } from './case-codec.js';
import { draftDocument } from './case-edit.js';
import type { DevTools } from './devtools.js';
interface Props {
    localCases?:DevTools['localCases'];
    index?: GraphIndex;
    prose?: ProseBundle | null;
    reader: ReaderState;
    dispatch: (a: CaseAction) => void;
    onSaved: (d: AnalysisDocument) => void;
    showPreview: boolean;
    onShare: () => void;
    onPreviewClose: () => void;
}
export function CaseActions({ localCases, index, prose, reader, dispatch, onSaved, showPreview, onShare, onPreviewClose }: Props) {
    const [localStatus,setLocalStatus]=useState('');
    const draftWrites=useRef(Promise.resolve());
    const draftId=useRef(crypto.randomUUID());
    useEffect(()=>{
        if(!localCases)return;
        setLocalStatus('Saving recovery file on this computer…');
        const snapshot=reader;
        const timer=setTimeout(()=>{
            const doc=draftDocument(snapshot);
            doc.identity={analysisId:snapshot.baseline?.identity.analysisId??draftId.current,revisionId:crypto.randomUUID()};
            if(snapshot.baseline)doc.parent=snapshot.baseline.identity;
            draftWrites.current=draftWrites.current.then(async()=>{
                try{const source=await localCases.draft(doc);if(currentReader.current===snapshot)setLocalStatus(`Recovery file saved: ${source}`);}
                catch(e){if(currentReader.current===snapshot)setLocalStatus(`Recovery file could not be saved: ${e instanceof Error?e.message:String(e)}`);}
            });
        },600);
        return ()=>clearTimeout(timer);
    },[reader.draft,localCases]);
    const [portable, setPortable] = useState<AnalysisDocument | null>(null);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [sharing, setSharing] = useState(false);
    const [shared, setShared] = useState<{
        document: AnalysisDocument;
        link: string;
    } | null>(null);
    const currentReader = useRef(reader);
    currentReader.current = reader;
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);
    const prepared = useMemo(() => reader ? prepareCase(reader) : null, [reader]);
    useEffect(() => setPortable(null), [reader]);
    const reviewPortable = () => {
        try {
            if (!prepared || !index || !prose) throw Error('Wait for the map descriptions to finish loading.');
            setPortable(parseCase(bundleCase(prepared, index, prose)));
            setError('');
        } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    };
    const publication = async (format: 'html' | 'pdf') => {
        if (!portable || exporting) return;
        setExporting(true); setError('');
        try {
            if (format === 'html') {
                const { exportInteractiveHtml, downloadPublication } = await import('./case-publication.js');
                downloadPublication(exportInteractiveHtml(portable), portable.content.title, 'html', 'text/html;charset=utf-8');
            } else {
                const { createCasePdf } = await import('./case-pdf.js');
                const pdf = await createCasePdf(portable);
                pdf.save(`${portable.content.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase() || 'case-study'}.pdf`);
            }
        } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setExporting(false); }
    };
    const save = async (separate = false, checkpoint?: AnalysisDocument) => {
        if (!reader)
            return null;
        try {
            if(localCases){
                const document=checkpoint??prepareCase(reader,separate);
                const source=await localCases.save(document);
                try{saveCase(reader,separate,document);}catch{/* The durable dataset file is authoritative. */}
                if(currentReader.current===reader){
                    dispatch({type:'open',state:{...reader,baseline:document,savePolicy:'continue'}});
                    onSaved(document);
                }
                setError(`Saved to local dataset: ${source}`);
                return document;
            }
            const result = saveCase(reader, separate, checkpoint);
            dispatch({ type: "open", state: result.state });
            if (result.state !== reader)
                onSaved(result.document);
            setError("");
            return result.document;
        }
        catch(e) {
            setError(localCases?`Not saved to the dataset: ${e instanceof Error?e.message:String(e)}`:"Not saved in this browser. Export the complete file to keep your work.");
            return null;
        }
    };
    const shown = showPreview ? prepared : null;
    const publish = async () => {
        if (!shown || sharing)
            return;
        const snapshot = reader;
        setSharing(true);
        setError("");
        try {
            const id = await publishCase(shown);
            if (!mounted.current)
                return;
            setShared({ document: shown, link: caseShareLink(id, window.location.href) });
            if (currentReader.current === snapshot) {
                try {
                    const saved = saveCase(snapshot, false, shown);
                    dispatch({ type: "open", state: saved.state });
                    if (saved.state !== snapshot)
                        onSaved(saved.document);
                    setError("Case study shared. Anyone with this link and access to the site can open it.");
                }
                catch {
                    setError("Case study shared, but not saved in this browser. Keep the shared link or export a file.");
                }
            }
            else
                setError("The previewed revision was shared. Your newer edits are still in the draft.");
        }
        catch (error) {
            if (mounted.current)
                setError(error instanceof Error ? error.message : "Could not share this case study. Try again or export a file.");
        }
        finally {
            if (mounted.current)
                setSharing(false);
        }
    };
    return <div class="case-document-actions">
    <div class="case-actions">
      <button onClick={() => save()}>Save revision</button>
      <button onClick={() => save(true)}>Save as separate case study</button>
      <button onClick={onShare}>Share</button>
      <button onClick={() => { if (prepared)
        downloadCase(prepared); }}>Export file</button>
      <button onClick={reviewPortable}>Export with map data / HTML / PDF</button>
    </div>
    {error && <p role="status">{error}</p>}
    {localCases&&<p role="status">{localStatus} Save revision writes a JSON file into case-studies/.</p>}
    {portable && <section class="case-share-preview" aria-label="Portable export preview">
      <h4>Portable export: {portable.content.title}</h4>
      <p>Includes {portable.embeddedMap!.nodes.length} nodes, their descriptions, {Object.keys(portable.embeddedMap!.references).length} sources, and this case's notes and archived stories. Anyone receiving this file can read that included content without access to your site.</p>
      <p>Only the case's selected prerequisites and supporting groups are included. Review the descriptions and notes before sending private material.</p>
      <details><summary>Included nodes and sources</summary><ul>{portable.embeddedMap!.nodes.map(n=><li key={n.id}>{n.label}</li>)}</ul><ul>{Object.values(portable.embeddedMap!.references).map(r=><li key={r.key}>{r.title}</li>)}</ul></details>
      <details><summary>Full export contents</summary><pre>{JSON.stringify(portable,null,2)}</pre></details>
      <button disabled={exporting} onClick={()=>downloadCase(portable)}>Export with map data (JSON)</button>
      <button disabled={exporting} onClick={()=>void publication('html')}>Export interactive HTML</button>
      <button disabled={exporting} onClick={()=>void publication('pdf')}>{exporting ? 'Preparing export…' : 'Export PDF'}</button>
      <p>HTML opens directly in a browser. PDF includes an overview, steps and node descriptions. JSON imports into another copy of this application. Existing site links still require access to their original site.</p>
      <button onClick={()=>setPortable(null)}>Close export preview</button>
    </section>}
      {shown && <section class="case-share-preview"><h4>Share preview: {shown.content.title}</h4><p>{shown.content.premise}</p><p>All notes, sources, context and archived stories below are included.</p>
        <details><summary>Included document</summary><pre>{JSON.stringify(shown, null, 2)}</pre></details>
        <p>{hosting().capabilities.sharing ? "Sharing saves this revision to the site. Anyone with its link and access to the site can read all included notes." : "Export this case study as a file to share it. Online sharing is not connected."}</p>
        {hosting().capabilities.sharing && <button disabled={sharing} onClick={publish}>{sharing ? "Sharing…" : "Share this revision"}</button>}
        {shared && <div class="case-shared-link">
          <label>Shared revision: {shared.document.content.title}<input aria-label="Shared case-study link" readOnly value={shared.link} onFocus={e => e.currentTarget.select()}/></label>
          <button onClick={async () => { try {
                await navigator.clipboard.writeText(shared.link);
                setError("Link copied.");
            }
            catch {
                setError("Could not copy automatically. Select and copy the shared link above.");
            } }}>Copy shared link</button>
        </div>}
        <button onClick={() => downloadCase(shown)}>Export complete file</button><button onClick={() => { onPreviewClose(); }}>Close preview</button>
      </section>}
  </div>;
}
