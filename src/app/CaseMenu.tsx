import profile from "@threat-map/data/profile.json";
import { useEffect, useRef, useState } from "preact/hooks";
import type { GraphIndex } from "../types.js";
import type { AnalysisDocument, ReaderState } from "./reader-state.js";
import { caseListModel } from "./case-route.js";
import { parseCase, MAX_CASE_BYTES } from "./case-codec.js";
import { loadCases } from "./case-store.js";
interface Props {
    onCreate: () => void;
    index: GraphIndex;
    reader: ReaderState | null;
    onOpen: (d: AnalysisDocument, local?: boolean) => void;
    onResume: () => void;
}
const blurbText = (text: string) => text.replace(/\s*\[@[^\]]+\]/g, "").trim();
export function CaseMenu({ onCreate, index, reader, onOpen, onResume }: Props) {
    const menuRef = useRef<HTMLDetailsElement>(null);
    const closeMenu = () => { if (menuRef.current)
        menuRef.current.open = false; };
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(loadCases);
    useEffect(() => { setSaved(loadCases()); }, [reader]);
    useEffect(() => {
        const dismiss = (event: PointerEvent) => {
            if (document.querySelector(".walkthrough-layer") && event.target instanceof Element && event.target.closest('[data-walkthrough="theme-toggle"]'))
                return;
            if (!menuRef.current?.contains(event.target as Node))
                closeMenu();
        };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
    }, []);
    const rows = caseListModel(index.caseStudies ?? [], saved, index.mapBasis?.revision ?? "", reader?.baseline ?? undefined);
    return <details ref={menuRef} class="case-menu" onKeyDown={e => {
            if (e.key === "Escape") {
                closeMenu();
                menuRef.current?.querySelector("summary")?.focus();
                e.stopPropagation();
            }
        }}>
    <summary class="btn case-menu-trigger" data-walkthrough="case-menu" data-tip="Browse, create and import case studies">Case studies</summary>
    <div class="case-menu-body">
      <h3>Explore case studies</h3>
      <button onClick={() => { closeMenu(); menuRef.current?.querySelector("summary")?.focus(); }}>Close case studies</button>
      <p>Follow a worked example through the threat map, or build a story of your own.</p>
      <button title="Choose a premise and outcome to start a case study" onClick={() => { closeMenu(); onCreate(); }}>Create new case study</button>
      <ul>{rows.map(row => <li key={row.document.identity.revisionId}>
        <button class="case-menu-card" data-walkthrough={row.document.identity.analysisId === profile.tutorialCase && row.source === "shipped" ? `case-example-${profile.tutorialCase}` : undefined} title="Open this case study" onClick={() => { closeMenu(); onOpen(row.document, row.source === "mine"); }}>
          <strong>{blurbText(row.title)}</strong>
          {row.premise && <span>{blurbText(row.premise)}</span>}
        </button>
      </li>)}</ul>
      <p><a href="#/page/worked-examples" onClick={closeMenu}>Browse all worked examples and background</a></p>
      <label>Import case study<input type="file" accept=".json,application/json" onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            if (!file)
                return;
            try {
                if (file.size > MAX_CASE_BYTES)
                    throw new Error("File exceeds the 1 MiB limit.");
                const doc = parseCase(await file.text(), index);
                onOpen(doc);
                setError("");
            }
            catch (e) {
                setError(String(e));
            }
        }}/></label>
      <button title="Continue the most recent draft saved in this browser" onClick={() => { closeMenu(); onResume(); }}>Resume autosaved draft</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
