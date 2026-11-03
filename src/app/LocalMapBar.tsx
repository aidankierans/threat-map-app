import { useRef, useState } from "preact/hooks";
import { MAX_MANIFEST_BYTES } from "../local-map.js";
import type { LocalMapState, LocalMapStore } from "./local-map-store.js";
interface Props {
    store: LocalMapStore;
    state: LocalMapState;
    editing: boolean;
    onStop: () => void;
}
export function LocalMapBar({ store, state, editing, onStop }: Props) {
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const file = useRef<HTMLInputElement>(null);
    const exportFile = () => {
        const url = URL.createObjectURL(new Blob([store.export()], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "threat-map.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const run = async (work: () => Promise<unknown>, done: string) => {
        setBusy(true);
        setStatus("");
        try {
            await work();
            setStatus(done);
        }
        catch (error) {
            setStatus(`Nothing was changed. ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setBusy(false);
        }
    };
    const importFile = (selected: File | undefined) => {
        if (!selected)
            return;
        if (selected.size > MAX_MANIFEST_BYTES)
            return setStatus("Nothing was changed. Map files are limited to 1.5 MiB.");
        if (state.changed && !window.confirm("Replace your local map with this file? Export your current map first if you want to keep it."))
            return;
        void run(async () => store.replace(await selected.text()), "Map file loaded. It is saved only in this browser.");
    };
    const reset = () => {
        if (window.confirm("Discard your local edits and return to the original map? This cannot be undone unless you have exported a map file."))
            void run(() => store.reset(), "Your local edits were discarded.");
    };
    return <div class="shared-notice local-map-bar" data-walkthrough="local-map-bar" role="region" aria-label="Local map">
    <p>
      {editing ? "You are editing a copy of this map that is saved only in this browser. Open a node's details to edit it, or use Add node and Add group." : "This map includes your local edits. They are saved only in this browser."}
      {" "}Export the map file to keep a copy or share it with someone else.
    </p>
    {state.unsaved && <p role="alert">This browser did not allow the map to be saved. Export the map file before leaving the page.</p>}
    {state.outdated && <p>Your copy was made from an earlier version of this map.</p>}
    {state.recovered && <p role="alert">{state.recovered}</p>}
    <div class="local-map-actions">
      <button class="btn" disabled={busy} onClick={exportFile}>Export map file</button>
      <button class="btn" disabled={busy} onClick={() => file.current?.click()}>Import map file</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { importFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }}/>
      {state.changed && <button class="btn" disabled={busy} onClick={reset}>Reset to original map</button>}
      {editing && <button class="btn" disabled={busy} onClick={onStop}>Stop editing</button>}
    </div>
    {status && <p role="status">{status}</p>}
  </div>;
}
