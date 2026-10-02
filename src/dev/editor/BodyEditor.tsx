import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ProseSite } from "../../app/ProseBody.js";
import { deleteDraft, getCompletions, getDoc, putDiscarded, putDoc, putDraft, type DocPayload, type DraftInfo, type EditorContext, } from "./api.js";
import { FrontmatterForm } from "./FrontmatterForm.js";
import { applyInsertion, buildInsertion, candidatesFor, detectTrigger, Picker, type Candidate, type Trigger, } from "./RefPicker.js";
const AUTOSAVE_MS = 1000;
export function saveChord(nav: {
    platform?: string;
    userAgent?: string;
}): string {
    const probe = `${nav.platform ?? ""} ${nav.userAgent ?? ""}`;
    return /Mac|iPhone|iPad|iPod/.test(probe) ? "⌘↵" : "Ctrl+↵";
}
const SAVE_CHORD = saveChord(navigator);
type Mode = "view" | "loading" | "edit";
interface EditState {
    body: string;
    caret: number;
    rev: number;
}
export function BodyEditor({ site, ctx }: {
    site: ProseSite;
    ctx: EditorContext;
}) {
    const [mode, setMode] = useState<Mode>("view");
    const [edit, setEdit] = useState<EditState | null>(null);
    const [strip, setStrip] = useState<string[]>([]);
    const [conflict, setConflict] = useState<boolean>(false);
    const [diff, setDiff] = useState<DiffLine[] | null>(null);
    const [aside, setAside] = useState<string | null>(null);
    const [draftOffer, setDraftOffer] = useState<DraftInfo | null>(null);
    const [picker, setPicker] = useState<{
        trigger: Trigger;
        candidates: Candidate[];
        selected: number;
    } | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [docPayload, setDocPayload] = useState<DocPayload | null>(null);
    const [savedTick, setSavedTick] = useState(0);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const regionRef = useRef<HTMLDivElement>(null);
    const entryRef = useRef("");
    const lastSavedRef = useRef("");
    const hashRef = useRef("");
    const sourceRef = useRef("");
    const conflictRef = useRef(false);
    const theirsRef = useRef("");
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const closingRef = useRef(false);
    const setConflictBoth = (value: boolean) => {
        conflictRef.current = value;
        setConflict(value);
        if (!value)
            setDiff(null);
    };
    const enter = useCallback(async (caret = 0) => {
        setMode("loading");
        setStrip([]);
        setConflictBoth(false);
        try {
            const doc = await getDoc(ctx, site.id);
            entryRef.current = doc.body;
            lastSavedRef.current = doc.body;
            hashRef.current = doc.hash;
            sourceRef.current = doc.source;
            setDocPayload(doc);
            setDraftOffer(doc.draft && doc.draft.body !== doc.body ? doc.draft : null);
            setAside(null);
            setEdit((prev) => ({ body: doc.body, caret, rev: (prev?.rev ?? -1) + 1 }));
            setMode("edit");
        }
        catch (err) {
            setStrip([`could not open ${site.id} for editing: ${(err as Error).message}`]);
            setMode("view");
        }
    }, [ctx, site.id]);
    useEffect(() => {
        const open = () => void enter();
        ctx.registry.add(open);
        return () => void ctx.registry.delete(open);
    }, [ctx, enter]);
    useEffect(() => {
        if (mode !== "edit" || !edit)
            return;
        const el = areaRef.current;
        if (!el)
            return;
        autogrow(el);
        el.focus();
        const at = resolveCaret(edit.caret, edit.body);
        el.setSelectionRange(at, at);
    }, [mode, edit]);
    const writeThrough = useCallback(async (text: string, keepalive = false): Promise<boolean> => {
        const result = await putDoc(ctx, { id: site.id, baseHash: hashRef.current, body: text }, { keepalive });
        if ("conflict" in result) {
            theirsRef.current = result.currentBody;
            setConflictBoth(true);
            setStrip(["This file changed on disk while you were editing — nothing was overwritten."]);
            await putDraft(ctx, site.id, text).catch(() => { });
            return false;
        }
        hashRef.current = result.hash;
        lastSavedRef.current = text;
        setStrip(relevantErrors(result.errors, sourceRef.current));
        if (result.changed)
            setSavedTick((t) => t + 1);
        return true;
    }, [ctx, site.id]);
    const autosave = useCallback(async () => {
        const el = areaRef.current;
        if (!el)
            return;
        const text = el.value;
        if (conflictRef.current) {
            await putDraft(ctx, site.id, text).catch(() => { });
            return;
        }
        if (text === lastSavedRef.current)
            return;
        await writeThrough(text).catch((err: Error) => setStrip([`autosave failed: ${err.message} — your text is still in the editor`]));
    }, [ctx, site.id, writeThrough]);
    const scheduleAutosave = () => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void autosave(), AUTOSAVE_MS);
    };
    const saveAndClose = useCallback(async () => {
        clearTimeout(debounceRef.current);
        const el = areaRef.current;
        if (!el)
            return;
        if (conflictRef.current)
            return;
        const text = el.value;
        if (text === lastSavedRef.current) {
            setMode("view");
            return;
        }
        try {
            if (await writeThrough(text))
                setMode("view");
        }
        catch (err) {
            setStrip([`save failed: ${(err as Error).message} — your text is still in the editor`]);
        }
    }, [writeThrough]);
    const cancel = useCallback(async () => {
        clearTimeout(debounceRef.current);
        closingRef.current = true;
        if (!conflictRef.current && lastSavedRef.current !== entryRef.current) {
            await writeThrough(entryRef.current).catch(() => { });
        }
        setMode("view");
        setConflictBoth(false);
        setStrip([]);
    }, [writeThrough]);
    useEffect(() => {
        if (mode !== "edit")
            return;
        const flush = () => {
            const el = areaRef.current;
            if (!el || conflictRef.current || el.value === lastSavedRef.current)
                return;
            void putDoc(ctx, { id: site.id, baseHash: hashRef.current, body: el.value }, { keepalive: true }).catch(() => { });
        };
        window.addEventListener("beforeunload", flush);
        return () => window.removeEventListener("beforeunload", flush);
    }, [mode, ctx, site.id]);
    const updatePicker = useCallback(async () => {
        const el = areaRef.current;
        if (!el)
            return;
        const trigger = detectTrigger(el.value, el.selectionStart ?? 0);
        if (!trigger) {
            setPicker(null);
            return;
        }
        try {
            const data = await getCompletions(ctx);
            const candidates = candidatesFor(trigger, data);
            setPicker(candidates.length ? { trigger, candidates, selected: 0 } : null);
        }
        catch {
            setPicker(null);
        }
    }, [ctx]);
    const pick = useCallback((c: Candidate) => {
        const el = areaRef.current;
        if (!el || !picker)
            return;
        applyInsertion(el, buildInsertion(picker.trigger, c.value, el.value, el.selectionStart ?? 0));
        setPicker(null);
    }, [picker]);
    const onKeyDown = (e: KeyboardEvent) => {
        if (picker) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const delta = e.key === "ArrowDown" ? 1 : -1;
                setPicker({
                    ...picker,
                    selected: (picker.selected + delta + picker.candidates.length) % picker.candidates.length,
                });
                return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                pick(picker.candidates[picker.selected]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setPicker(null);
                return;
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void saveAndClose();
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            void cancel();
        }
    };
    const onBlur = (e: FocusEvent) => {
        if (closingRef.current) {
            closingRef.current = false;
            return;
        }
        const to = e.relatedTarget;
        if (to instanceof Node && regionRef.current?.contains(to))
            return;
        if (mode === "edit")
            void saveAndClose();
    };
    const toggleDiff = () => {
        setDiff((open) => open ? null : diffLines(areaRef.current?.value ?? "", theirsRef.current));
    };
    const takeTheirs = useCallback(async () => {
        clearTimeout(debounceRef.current);
        const rejected = areaRef.current?.value ?? "";
        await putDraft(ctx, site.id, rejected).catch(() => { });
        await deleteDraft(ctx, site.id).catch(() => { });
        setConflictBoth(false);
        await enter(0);
        if (rejected !== lastSavedRef.current)
            setAside(rejected);
    }, [ctx, enter, site.id]);
    const keepMine = useCallback(async () => {
        clearTimeout(debounceRef.current);
        const el = areaRef.current;
        if (!el)
            return;
        const doc = await getDoc(ctx, site.id).catch(() => null);
        if (!doc)
            return;
        await putDiscarded(ctx, site.id).catch(() => { });
        hashRef.current = doc.hash;
        setConflictBoth(false);
        if (await writeThrough(el.value))
            setMode("view");
    }, [ctx, site.id, writeThrough]);
    const restoreAside = useCallback(() => {
        if (aside == null || !edit)
            return;
        setEdit({ body: aside, caret: 0, rev: edit.rev + 1 });
        setAside(null);
        scheduleAutosave();
    }, [aside, edit]);
    const commitFrontmatter = useCallback(async (patch: {
        set?: Record<string, unknown>;
        unset?: string[];
    }): Promise<string[]> => {
        clearTimeout(debounceRef.current);
        const el = areaRef.current;
        if (conflictRef.current)
            return ["file changed on disk — resolve the conflict first"];
        if (el && el.value !== lastSavedRef.current) {
            const flushed = await writeThrough(el.value).catch(() => false);
            if (!flushed)
                return ["could not flush the body — metadata not applied"];
        }
        try {
            const result = await putDoc(ctx, { id: site.id, baseHash: hashRef.current, ...patch });
            if ("conflict" in result) {
                if (mode !== "edit") {
                    const fresh = await getDoc(ctx, site.id).catch(() => null);
                    if (fresh) {
                        hashRef.current = fresh.hash;
                        setDocPayload(fresh);
                    }
                    return ["file changed on disk — metadata reloaded, apply again"];
                }
                theirsRef.current = result.currentBody;
                setConflictBoth(true);
                return ["file changed on disk — resolve the conflict banner first"];
            }
            if (result.outcome === "drafted") {
                return ["not applied — kept as a draft", ...result.errors];
            }
            hashRef.current = result.hash;
            if (result.changed)
                setSavedTick((t) => t + 1);
            return relevantErrors(result.errors, sourceRef.current);
        }
        catch (err) {
            return [`metadata save failed: ${(err as Error).message}`];
        }
    }, [ctx, site.id, writeThrough, mode]);
    const toggleFormInView = useCallback(async () => {
        if (showForm) {
            setShowForm(false);
            return;
        }
        try {
            const doc = await getDoc(ctx, site.id);
            hashRef.current = doc.hash;
            sourceRef.current = doc.source;
            lastSavedRef.current = doc.body;
            setDocPayload(doc);
            setShowForm(true);
        }
        catch (err) {
            setStrip([`could not load metadata for ${site.id}: ${(err as Error).message}`]);
        }
    }, [ctx, site.id, showForm]);
    const restoreDraft = useCallback(() => {
        if (!draftOffer || !edit)
            return;
        setEdit({ body: draftOffer.body, caret: 0, rev: edit.rev + 1 });
        setDraftOffer(null);
        scheduleAutosave();
    }, [draftOffer, edit]);
    const discardDraft = useCallback(async () => {
        await deleteDraft(ctx, site.id).catch(() => { });
        setDraftOffer(null);
    }, [ctx, site.id]);
    if (mode === "edit" && edit) {
        return (<div class="edt-region edt-editing" ref={regionRef}>
        {draftOffer && (<div class="edt-conflict">
            <span>
              Unsaved draft from {timeOf(draftOffer.savedAt)} ({draftOffer.reason}).
            </span>
            <button class="edt-btn" onClick={restoreDraft}>
              restore
            </button>
            <button class="edt-btn" onClick={() => void discardDraft()}>
              discard
            </button>
          </div>)}
        <button class="edt-btn edt-form-toggle" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "▾" : "▸"} metadata
        </button>
        {showForm && docPayload && (<FrontmatterForm doc={docPayload} index={ctx.index} onCommit={commitFrontmatter}/>)}
        <textarea key={edit.rev} ref={areaRef} class="edt-text" defaultValue={edit.body} spellcheck={true} lang="en" onKeyDown={onKeyDown} onBlur={onBlur} onInput={(e) => {
                autogrow(e.currentTarget);
                scheduleAutosave();
                void updatePicker();
                if (diff)
                    setDiff(diffLines(e.currentTarget.value, theirsRef.current));
            }}/>
        {picker && (<Picker candidates={picker.candidates} selected={picker.selected} onPick={pick}/>)}
        {conflict && (<div class="edt-conflict">
            <span>File changed on disk — your typing is parked in a draft.</span>
            <button class="edt-btn" onClick={toggleDiff}>
              {diff ? "hide diff" : "see diff"}
            </button>
            <button class="edt-btn" onClick={() => void takeTheirs()}>
              take theirs
            </button>
            <button class="edt-btn" onClick={() => void keepMine()}>
              keep mine
            </button>
          </div>)}
        {diff && (<div class="edt-diff">
            <div class="edt-diff-legend">− on disk · + yours</div>
            {diff.map((line, i) => (<div key={i} class={`edt-diff-${line.kind}`}>
                {line.kind === "same" ? "  " : line.kind === "mine" ? "+ " : "− "}
                {line.text}
              </div>))}
          </div>)}
        <Strip lines={strip}/>
        <div class="edt-hint">
          {SAVE_CHORD} save · esc cancel · autosaves as you type
          {aside != null && (<span class="edt-aside">
              {" "}
              · your version was set aside ·{" "}
              <button class="edt-btn" onClick={restoreAside}>
                restore
              </button>
            </span>)}
          
          {savedTick > 0 && (<span key={savedTick} class="edt-saved">
              {" "}
              · saved ✓
            </span>)}
        </div>
      </div>);
    }
    return (<div class="edt-region" title="Click to edit (e)">
      <button class="edt-btn edt-form-toggle" title="Edit this doc's tags and fields without opening the notes editor" onClick={() => void toggleFormInView()}>
        {showForm ? "▾" : "▸"} edit metadata
      </button>
      {showForm && docPayload && (<FrontmatterForm doc={docPayload} index={ctx.index} onCommit={commitFrontmatter}/>)}
      <div class={site.class} style={site.style} onClick={(e) => {
            const target = e.target as Element;
            if (target.closest("a"))
                return;
            if (mode === "loading")
                return;
            void enter(caretForClick(e));
        }} dangerouslySetInnerHTML={{ __html: site.html ?? "" }}/>
      <Strip lines={strip}/>
    </div>);
}
function Strip({ lines }: {
    lines: string[];
}) {
    if (!lines.length)
        return null;
    return (<div class="edt-strip">
      {lines.map((line) => (<div key={line}>✗ {line}</div>))}
    </div>);
}
function timeOf(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "earlier" : d.toLocaleTimeString();
}
function relevantErrors(errors: string[], source: string): string[] {
    const mine = errors.filter((e) => e.includes(source));
    const others = errors.length - mine.length;
    if (others > 0)
        mine.push(`${others} error(s) elsewhere in the content — see the terminal`);
    return mine;
}
function caretForClick(e: MouseEvent): number {
    const container = e.currentTarget as HTMLElement;
    const target = e.target as Element;
    let child: Element | null = target === container ? null : target;
    while (child && child.parentElement !== container)
        child = child.parentElement;
    if (!child)
        return 0;
    const index = Array.from(container.children).indexOf(child);
    return index <= 0 ? 0 : -index;
}
export function resolveCaret(caret: number, body: string): number {
    if (caret >= 0)
        return Math.min(caret, body.length);
    const index = -caret;
    const blocks = body.split(/\n\n+/);
    let offset = 0;
    for (let i = 0; i < Math.min(index, blocks.length - 1); i++) {
        offset += blocks[i].length;
        const sep = body.slice(offset).match(/^\n+/);
        offset += sep ? sep[0].length : 0;
    }
    return Math.min(offset, body.length);
}
export interface DiffLine {
    kind: "same" | "mine" | "theirs";
    text: string;
}
export function diffLines(mine: string, theirs: string): DiffLine[] {
    const a = theirs.split("\n");
    const b = mine.split("\n");
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
        start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }
    const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: "same" as const, text }));
    const mid = diffMiddle(a.slice(start, endA), b.slice(start, endB));
    out.push(...mid, ...a.slice(endA).map((text) => ({ kind: "same" as const, text })));
    return out;
}
function diffMiddle(a: string[], b: string[]): DiffLine[] {
    if (a.length * b.length > 1000000) {
        return [
            ...a.map((text) => ({ kind: "theirs" as const, text })),
            ...b.map((text) => ({ kind: "mine" as const, text })),
        ];
    }
    const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            out.push({ kind: "same", text: a[i] });
            i++;
            j++;
        }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            out.push({ kind: "theirs", text: a[i++] });
        }
        else {
            out.push({ kind: "mine", text: b[j++] });
        }
    }
    while (i < a.length)
        out.push({ kind: "theirs", text: a[i++] });
    while (j < b.length)
        out.push({ kind: "mine", text: b[j++] });
    return out;
}
function autogrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
}
