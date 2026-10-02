import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FilterPreset, TaxonomyEntry } from "../types.js";
import { DEFAULT_FILTERS, FOLD_ALL, FOLD_NONE, expandSet, hasActiveFilters, sameFold, type FilterState, type Graph, type HiddenMode, type HiddenSet, } from "./selectors.js";
import { cleanName, dropSaved, loadSeeded, resetShipped, storeSeeded, exportText, filtersOf, isApplied, mergeSaved, parseImport, putSaved, useSavedFilters, type SavedFilter, } from "./saved.js";
interface Props {
    toolbarStart?: ComponentChildren;
    graph: Graph;
    filters: FilterState;
    onChange: (patch: Partial<FilterState>) => void;
    visibleCount: number;
    shownCount: number;
    totalCount: number;
    hideable: readonly string[];
    onHideSelected: (mode: HiddenMode) => void;
    onSelectNodes: (ids: string[]) => void;
    columnsMoved: boolean;
    onResetColumns: () => void;
    storyModeMatters?: boolean | null;
}
export interface Option {
    value: string;
    label: string;
}
export function optionsOf(tax: {
    order?: readonly string[];
    values: Record<string, TaxonomyEntry>;
} | undefined): Option[] {
    if (!tax)
        return [];
    const keys = tax.order?.length ? tax.order : Object.keys(tax.values);
    return keys.map((value) => ({ value, label: tax.values[value]?.label ?? value }));
}
function sameSet(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v) => b.includes(v));
}
export function toggle(checked: readonly string[], value: string, options: Option[]): string[] | null {
    const next = new Set(checked);
    if (!next.delete(value))
        next.add(value);
    const values = options.map((o) => o.value).filter((v) => next.has(v));
    return sameSet(values, options.map((o) => o.value)) ? null : values;
}
export function useCloseMenus(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            const host = ref.current;
            if (!host)
                return;
            for (const open of host.querySelectorAll("details[open]")) {
                if (!open.contains(e.target as Node))
                    open.removeAttribute("open");
            }
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [ref]);
}
export function Filters({ toolbarStart, graph, filters, onChange, visibleCount, shownCount, totalCount, hideable, onHideSelected, onSelectNodes, columnsMoved, onResetColumns, storyModeMatters, }: Props) {
    const barRef = useRef<HTMLDivElement>(null);
    useCloseMenus(barRef);
    const active = hasActiveFilters(filters);
    const searching = filters.query.trim().length > 0;
    return (<div class="controls" id="filter-bar" ref={barRef}>
      {toolbarStart}

      
      <button class="btn" onClick={() => onHideSelected("applied")} disabled={hideable.length === 0} title={hideable.length
            ? `Exclude these ${hideable.length} and their dependent steps from this view, as a set you can restore. This does not assess whether they are absent in a deployment.`
            : "Select nodes on the canvas first — they are what the set would hold"}>
        Hide selected{hideable.length ? ` (${hideable.length})` : ""}
      </button>

      <button class="btn" onClick={() => onHideSelected("shape")} disabled={hideable.length === 0} title={hideable.length
            ? `Hide these ${hideable.length} boxes while retaining their dependencies. This changes visual detail, not whether their claims are accepted.`
            : "Select nodes on the canvas first — they are what the set would hold"}>
        Hide boxes only{hideable.length ? ` (${hideable.length})` : ""}
      </button>

      {filters.hidden.length > 0 && (<HiddenSets graph={graph} sets={filters.hidden} onChange={(hidden) => onChange({ hidden })} onSelectNodes={onSelectNodes}/>)}

      
      <div class="storybtns" role="group" aria-label="Trace a threat story">
        <button class="btn" aria-pressed={filters.story === "all" ? "true" : "false"} onClick={() => onChange({ story: filters.story === "all" ? null : "all" })} data-walkthrough="map-story" title={storyModeMatters === false
            ? "Trace one chain that runs through everything selected. This selection has fewer than two nodes on the way through, so it is the same chain either button draws"
            : "Trace one chain that runs through everything selected — from whatever is furthest left to whatever is furthest right"}>
          Story: all
        </button>
        <button class="btn" aria-pressed={filters.story === "any" ? "true" : "false"} onClick={() => onChange({ story: filters.story === "any" ? null : "any" })} title={storyModeMatters === false
            ? "Trace one chain per selected node. This selection has fewer than two nodes on the way through, so there is one chain to draw and it is the same one the other button draws"
            : "Trace one chain per selected node, drawn together — what each of them separately leads to"}>
          any
        </button>
      </div>

      
      <div class="storybtns" role="group" aria-label="Fold the bands">
        <button class="btn" aria-pressed={sameFold(filters.fold, FOLD_ALL) ? "true" : "false"} onClick={() => onChange({ fold: FOLD_ALL })} title="Draw every group as one box, with its members' relations gathered onto it. Double-click a box to open one group; the panel offers the same">
          Collapse groups
        </button>
        <button class="btn" aria-pressed={sameFold(filters.fold, FOLD_NONE) ? "true" : "false"} onClick={() => onChange({ fold: FOLD_NONE })} title="Draw every group's members as their own boxes">
          Expand groups
        </button>
      </div>

      
      <button class="btn" aria-pressed={filters.showPartialGates ? "true" : "false"} onClick={() => onChange({ showPartialGates: !filters.showPartialGates })} title="Also draw the AND gates a filter has left a member short, with a ring for each member that is gone, and the arrows still arriving at them">
        Show partial gates
      </button>

      <div class="ctl">
        <input type="search" data-walkthrough="map-search" placeholder="Search the map…" value={filters.query} onInput={(e) => onChange({ query: (e.target as HTMLInputElement).value })} aria-label="Search nodes" title="Dims every box but the ones that match, and rings the ones that do — it does not remove anything"/>
      </div>

      
      <SavedFilters filters={filters} presets={graph.index.presets} onApply={(next) => onChange(next)}/>

      <button class="btn resetall" onClick={() => onChange(DEFAULT_FILTERS)} disabled={!active} title="Tick every box again, forget every hidden set, and empty the search box">
        Reset all filters
      </button>

      
      <button class="btn resetall" onClick={onResetColumns} disabled={!columnsMoved} title={columnsMoved
            ? "Put the columns back in the order the content declares"
            : "The columns are in their declared order — move one with the arrows on its heading"}>
        Reset column order
      </button>

      <span class="spacer"/>
      
      <span class="hint">
        {shownCount} of {totalCount} nodes{searching ? ` · ${visibleCount} matched` : ""}
      </span>
    </div>);
}
function download(filename: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function exportName(): string {
    return `threat-map-filters-${new Date().toISOString().slice(0, 10)}.json`;
}
function SavedFilters({ filters, presets, onApply, }: {
    filters: FilterState;
    presets: readonly FilterPreset[];
    onApply: (filters: FilterState) => void;
}) {
    const [saved, setSaved] = useSavedFilters(presets, import.meta.env.MODE === "development");
    const [name, setName] = useState("");
    const [picking, setPicking] = useState(false);
    const [picked, setPicked] = useState<string[]>([]);
    const [note, setNote] = useState<{
        text: string;
        bad?: boolean;
    } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const chosen = picked.length ? saved.filter((s) => picked.includes(s.name)) : saved;
    const applied = saved.find((s) => isApplied(s, filters));
    const narrowed = hasActiveFilters(filters);
    const save = () => {
        const label = cleanName(name);
        const over = saved.some((s) => s.name === label);
        setSaved(putSaved(saved, name, filters));
        setName("");
        setNote(over ? { text: `Updated “${label}”.` } : null);
    };
    const forget = (target: SavedFilter) => {
        setSaved(dropSaved(saved, target.name));
        setPicked(picked.filter((p) => p !== target.name));
    };
    const resetShippedViews = () => {
        const { list, seeded } = resetShipped(saved, presets, loadSeeded());
        storeSeeded(seeded);
        setSaved(list);
        setPicked([]);
        setNote({ text: `Restored ${seeded.size} shipped view${seeded.size === 1 ? "" : "s"}.` });
    };
    const stopPicking = () => {
        setPicking(false);
        setPicked([]);
    };
    const doExport = () => {
        download(exportName(), exportText(chosen));
        setNote({ text: `Exported ${chosen.length} view${chosen.length === 1 ? "" : "s"}.` });
        stopPicking();
    };
    const doImport = async (file: File) => {
        try {
            const { list, renamed } = mergeSaved(saved, parseImport(await file.text()));
            const added = list.length - saved.length;
            setSaved(list);
            setNote({
                text: (added ? `Added ${added}.` : "Nothing new — those are already here.") +
                    (renamed.length ? ` Renamed ${renamed.length} that clashed.` : ""),
            });
        }
        catch (err) {
            setNote({ text: err instanceof Error ? err.message : "That file could not be read.", bad: true });
        }
    };
    return (<details class={`facet ${applied ? "set" : ""}`} id="f-saved">
      <summary aria-label={`Saved views, ${saved.length} kept`} data-tip="Whole sets of filters, kept under a name — click one to put the map back that way">
        Saved views
        {saved.length ? <span class="count">{saved.length}</span> : null}
      </summary>
      <div class="facetmenu">
        {saved.map((entry) => {
            const on = entry === applied;
            return (<div class="savedrow" key={entry.name}>
              {picking ? (<input type="checkbox" checked={picked.includes(entry.name)} onChange={() => setPicked(picked.includes(entry.name)
                        ? picked.filter((p) => p !== entry.name)
                        : [...picked, entry.name])} aria-label={`Include ${entry.name} in an export`}/>) : null}
              <button class="savedname" aria-pressed={on ? "true" : "false"} onClick={() => onApply(filtersOf(entry))} title={on
                    ? "The bar is already set this way"
                    : `Put the map back the way “${entry.name}” was saved`}>
                {entry.name}
              </button>
              <button class="rowbtn" onClick={() => forget(entry)} aria-label={`Forget the saved view ${entry.name}`} title="Forget this view">
                ×
              </button>
            </div>);
        })}

        {saved.length ? (<p class="facetnote">
            {picking
                ? "Tick to choose what an export carries; untick everything for all."
                : "Click a name to put the map back the way it was saved."}
          </p>) : (<p class="facetnote">
            Nothing kept yet. Narrow the map with the controls to the left, then name it here.
          </p>)}

        
        <div class="savedadd">
          <input type="text" value={name} placeholder="Name this view" aria-label="Name for the current filters" onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && narrowed)
                save();
        }}/>
          <button onClick={save} disabled={!name.trim() || !narrowed} title={narrowed
            ? "Keep the current view under this name — an existing name is overwritten"
            : "Nothing is filtered, so there is nothing to keep"}>
            Save
          </button>
        </div>

        
        <div class="facetbulk">
          {picking ? (<>
              <button onClick={doExport} disabled={!chosen.length} title="Write them to a JSON file">
                Export{picked.length ? ` ${picked.length}` : saved.length ? " all" : ""}
              </button>
              <button onClick={stopPicking} title="Leave the ticks alone and go back">
                Cancel
              </button>
            </>) : (<>
              <button onClick={() => setPicking(true)} disabled={!saved.length} title="Choose which views to write to a JSON file">
                Export…
              </button>
              <button onClick={() => fileRef.current?.click()} title="Read views from a JSON file">
                Import…
              </button>
              <button onClick={resetShippedViews} disabled={!presets.length} title="Put back the views the map ships with, as they currently stand — your own views stay">
                Reset shipped
              </button>
            </>)}
        </div>
        
        <input ref={fileRef} type="file" accept="application/json,.json" class="hiddenfile" onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (file)
                void doImport(file);
        }}/>

        {note ? <p class={`facetnote ${note.bad ? "bad" : ""}`}>{note.text}</p> : null}
      </div>
    </details>);
}
function HiddenSets({ graph, sets, onChange, onSelectNodes, }: {
    graph: Graph;
    sets: readonly HiddenSet[];
    onChange: (sets: HiddenSet[]) => void;
    onSelectNodes: (ids: string[]) => void;
}) {
    const MODES: {
        value: HiddenMode;
        label: string;
        title: string;
    }[] = [
        {
            value: "applied",
            label: "hidden",
            title: "Off the canvas, and so is whatever only these fed",
        },
        {
            value: "shape",
            label: "boxes only",
            title: "Boxes off the canvas; every gate they feed stays satisfied",
        },
        { value: "held", label: "held", title: "Drawn and outlined — nothing removed" },
    ];
    const removing = sets.filter((s) => s.mode !== "held");
    const goneCount = new Set(removing.flatMap((s) => expandSet(graph, s.ids))).size;
    const replace = (i: number, next: HiddenSet) => onChange(sets.map((s, j) => (j === i ? next : s)));
    const nameOf = (set: HiddenSet) => {
        const [first, ...rest] = set.ids;
        return rest.length ? `${first} +${rest.length}` : first!;
    };
    const membersOf = (set: HiddenSet) => set.ids
        .map((id) => {
        const band = graph.index.groups.find((b) => b.id === id);
        if (band)
            return `${band.short ?? band.label} (${band.members.length})`;
        return graph.byId.get(id)?.label ?? id;
    })
        .join(", ");
    return (<details class={`facet ${goneCount ? "set" : ""}`} id="f-hidden">
      <summary aria-label={`Hidden sets, ${goneCount} nodes hidden`} data-tip="The sets you have taken off the canvas — put any of them back here">
        Hidden
        {goneCount ? <span class="count">{goneCount}</span> : null}
      </summary>
      <div class="facetmenu">
        {sets.map((set, i) => (<div class="hiddenrow" key={`${i}:${set.ids.join(",")}`}>
            <select value={set.mode} aria-label={`What the set ${nameOf(set)} does`} onChange={(e) => replace(i, { ...set, mode: (e.target as HTMLSelectElement).value as HiddenMode })}>
              {MODES.map((m) => (<option key={m.value} value={m.value} title={m.title}>
                  {m.label}
                </option>))}
            </select>
            <button class="rowbtn hiddenname" title={membersOf(set)} onClick={() => onSelectNodes(expandSet(graph, set.ids))}>
              <span class={set.mode === "held" ? "held" : ""}>{nameOf(set)}</span>
            </button>
            <button class="rowbtn" onClick={() => onChange(sets.filter((_, j) => j !== i))} aria-label={`Forget the hidden set ${nameOf(set)}`} title="Forget this set">
              ×
            </button>
          </div>))}
        
        <p class="facetnote">
          <strong>hidden</strong> takes the chain with it; <strong>boxes only</strong> leaves
          the chain standing; <strong>held</strong> draws them again, outlined.
        </p>
        <div class="facetbulk">
          <button onClick={() => onChange(sets.map((s) => ({ ...s, mode: "applied" as const })))} disabled={sets.every((s) => s.mode === "applied")} title="Switch every set above to hidden">
            Hide all
          </button>
          <button onClick={() => onChange(sets.map((s) => ({ ...s, mode: "held" as const })))} disabled={sets.every((s) => s.mode === "held")} title="Switch every set above to held, so they are drawn again, outlined">
            Hold all
          </button>
        </div>
      </div>
    </details>);
}
export function Facet({ id, label, tip, options, checked, onToggle, onAll, onNone, }: {
    id: string;
    label: string;
    tip: string;
    options: Option[];
    checked: readonly string[];
    onToggle: (value: string) => void;
    onAll: () => void;
    onNone: () => void;
}) {
    const narrowed = checked.length < options.length;
    return (<details class={`facet ${narrowed ? "set" : ""}`} id={id}>
      <summary aria-label={`${label} filter, ${checked.length} of ${options.length} values shown`} data-tip={tip}>
        {label}
        {narrowed ? (<span class="count">
            {checked.length}/{options.length}
          </span>) : null}
      </summary>
      <div class="facetmenu">
        {options.map((o) => (<label key={o.value}>
            <input type="checkbox" value={o.value} checked={checked.includes(o.value)} onChange={() => onToggle(o.value)}/>
            {o.label}
          </label>))}
        
        <div class="facetbulk">
          <button onClick={onAll} disabled={!narrowed} title="Tick every value in this menu">
            All
          </button>
          <button onClick={onNone} disabled={checked.length === 0} title="Untick every value in this menu">
            None
          </button>
        </div>
      </div>
    </details>);
}
