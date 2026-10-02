import { hosting } from "./hosting.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AnalysisDocument, ReaderState } from "./reader-state.js";
import type { CaseAction } from "./case-edit.js";
import { caseShareLink } from "./case-route.js";
import { downloadCase, prepareCase, saveCase } from "./case-store.js";
import { publishCase } from "./case-api.js";
interface Props {
    reader: ReaderState;
    dispatch: (a: CaseAction) => void;
    onSaved: (d: AnalysisDocument) => void;
    showPreview: boolean;
    onShare: () => void;
    onPreviewClose: () => void;
}
export function CaseActions({ reader, dispatch, onSaved, showPreview, onShare, onPreviewClose }: Props) {
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
    const save = (separate = false, checkpoint?: AnalysisDocument) => {
        if (!reader)
            return null;
        try {
            const result = saveCase(reader, separate, checkpoint);
            dispatch({ type: "open", state: result.state });
            if (result.state !== reader)
                onSaved(result.document);
            setError("");
            return result.document;
        }
        catch {
            setError("Not saved in this browser. Export the complete file to keep your work.");
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
    </div>
    {error && <p role="status">{error}</p>}
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
