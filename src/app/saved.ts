import { useCallback, useState } from "preact/hooks";
import { SAVED_KEY, SEEDED_KEY } from "./config.js";
import { formatFilters, parseFilters } from "./router.js";
import type { FilterState } from "./selectors.js";
import { SAVED_FILTER_KIND, type FilterPreset } from "../types.js";
export interface SavedFilter {
    name: string;
    query: string;
    description?: string;
}
export const EXPORT_KIND = SAVED_FILTER_KIND;
export const EXPORT_VERSION = 1;
export const MAX_NAME = 60;
export function cleanName(name: string): string {
    return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}
export function normalizeQuery(query: string): string {
    return formatFilters(parseFilters(query));
}
export function isApplied(saved: SavedFilter, filters: FilterState): boolean {
    return saved.query === formatFilters(filters);
}
export function filtersOf(saved: SavedFilter): FilterState {
    return parseFilters(saved.query);
}
export function putSaved(list: readonly SavedFilter[], name: string, filters: FilterState): SavedFilter[] {
    const entry = { name: cleanName(name), query: formatFilters(filters) };
    if (!entry.name)
        return [...list];
    const at = list.findIndex((s) => s.name === entry.name);
    if (at < 0)
        return [...list, entry];
    return list.map((s, i) => (i === at ? entry : s));
}
export function dropSaved(list: readonly SavedFilter[], name: string): SavedFilter[] {
    return list.filter((s) => s.name !== name);
}
function freeName(taken: ReadonlySet<string>, name: string): string {
    if (!taken.has(name))
        return name;
    for (let n = 2;; n++) {
        const candidate = cleanName(`${name} (${n})`);
        if (!taken.has(candidate))
            return candidate;
    }
}
export function exportText(list: readonly SavedFilter[]): string {
    const payload = {
        kind: EXPORT_KIND,
        version: EXPORT_VERSION,
        filters: list.map((s) => ({
            name: s.name,
            query: s.query,
            ...(s.description ? { description: s.description } : {}),
        })),
    };
    return JSON.stringify(payload, null, 2) + "\n";
}
export function parseImport(text: string): SavedFilter[] {
    let data: unknown;
    try {
        data = JSON.parse(text);
    }
    catch {
        throw new Error("That file is not JSON.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("That file is not a saved-filter export.");
    }
    const wrapper = data as {
        kind?: unknown;
        filters?: unknown;
    };
    if (wrapper.kind !== EXPORT_KIND) {
        throw new Error("That file is not a saved-filter export.");
    }
    if (!Array.isArray(wrapper.filters)) {
        throw new Error("That export has no filters in it.");
    }
    const filters: SavedFilter[] = [];
    const seen = new Set<string>();
    for (const raw of wrapper.filters) {
        if (!raw || typeof raw !== "object")
            continue;
        const entry = raw as {
            name?: unknown;
            query?: unknown;
            description?: unknown;
        };
        if (typeof entry.name !== "string" || typeof entry.query !== "string")
            continue;
        const name = cleanName(entry.name);
        if (!name)
            continue;
        const unique = freeName(seen, name);
        seen.add(unique);
        filters.push({
            name: unique,
            query: normalizeQuery(entry.query),
            ...(typeof entry.description === "string" && entry.description.trim()
                ? { description: entry.description.trim() }
                : {}),
        });
    }
    if (!filters.length)
        throw new Error("That export has no filters in it.");
    return filters;
}
export interface MergeResult {
    list: SavedFilter[];
    renamed: string[];
}
export function mergeSaved(existing: readonly SavedFilter[], incoming: readonly SavedFilter[]): MergeResult {
    const list = [...existing];
    const taken = new Set(list.map((s) => s.name));
    const renamed: string[] = [];
    for (const entry of incoming) {
        if (list.some((s) => s.name === entry.name && s.query === entry.query))
            continue;
        const name = freeName(taken, entry.name);
        if (name !== entry.name)
            renamed.push(entry.name);
        taken.add(name);
        list.push({ name, query: entry.query, ...(entry.description ? { description: entry.description } : {}) });
    }
    return { list, renamed };
}
export function loadSaved(): SavedFilter[] {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(SAVED_KEY);
    }
    catch {
        return [];
    }
    if (!raw)
        return [];
    try {
        return parseImport(raw);
    }
    catch {
        return [];
    }
}
export function storeSaved(list: readonly SavedFilter[]): void {
    try {
        localStorage.setItem(SAVED_KEY, exportText(list));
    }
    catch {
    }
}
export type Seeded = ReadonlyMap<string, string | null>;
export function loadSeeded(): Map<string, string | null> {
    try {
        const raw = localStorage.getItem(SEEDED_KEY);
        if (!raw)
            return new Map();
        const data: unknown = JSON.parse(raw);
        if (Array.isArray(data)) {
            return new Map(data.filter((n): n is string => typeof n === "string").map((n) => [n, null]));
        }
        if (!data || typeof data !== "object")
            return new Map();
        return new Map(Object.entries(data as Record<string, unknown>).map(([name, q]) => [
            name,
            typeof q === "string" ? q : null,
        ]));
    }
    catch {
        return new Map();
    }
}
export function storeSeeded(offered: Seeded | Iterable<string>): void {
    const map: Seeded = offered instanceof Map
        ? offered
        : new Map([...(offered as Iterable<string>)].map((n) => [n, null] as const));
    try {
        const record: Record<string, string | null> = {};
        for (const name of [...map.keys()].sort())
            record[name] = map.get(name) ?? null;
        localStorage.setItem(SEEDED_KEY, JSON.stringify(record));
    }
    catch {
    }
}
export interface SeedResult {
    list: SavedFilter[];
    added: SavedFilter[];
    updated: SavedFilter[];
    removed: SavedFilter[];
    seeded: Map<string, string | null>;
}
function shippedEntry(p: FilterPreset): SavedFilter | undefined {
    const name = cleanName(p.name);
    if (!name)
        return undefined;
    return {
        name,
        query: normalizeQuery(p.query),
        ...(p.description ? { description: p.description } : {}),
    };
}
function isShippedCopy(entry: SavedFilter, shippedQuery: string | null): boolean {
    if (!entry.description)
        return false;
    return shippedQuery === null || entry.query === shippedQuery;
}
export function seedPresets(existing: readonly SavedFilter[], presets: readonly FilterPreset[], seen: Seeded): SeedResult {
    let list = [...existing];
    const added: SavedFilter[] = [];
    const updated: SavedFilter[] = [];
    const removed: SavedFilter[] = [];
    const fresh: SavedFilter[] = [];
    const seeded = new Map<string, string | null>();
    for (const p of presets) {
        const entry = shippedEntry(p);
        if (!entry)
            continue;
        seeded.set(entry.name, entry.query);
        if (!seen.has(entry.name)) {
            fresh.push(entry);
            continue;
        }
        const prev = seen.get(entry.name) ?? null;
        if (prev === entry.query)
            continue;
        if (list.some((s) => s.name === entry.name && s.query === entry.query))
            continue;
        const at = list.findIndex((s) => s.name === entry.name && isShippedCopy(s, prev));
        if (at >= 0) {
            list[at] = entry;
            updated.push(entry);
        }
        else if (prev !== null) {
            fresh.push(entry);
        }
    }
    for (const [name, prev] of seen) {
        if (seeded.has(name))
            continue;
        const at = list.findIndex((s) => s.name === name && isShippedCopy(s, prev));
        if (at >= 0) {
            removed.push(list[at]!);
            list.splice(at, 1);
        }
    }
    if (fresh.length) {
        const before = list.length;
        list = mergeSaved(list, fresh).list;
        added.push(...list.slice(before));
    }
    return { list, added, updated, removed, seeded };
}
export function resetShipped(existing: readonly SavedFilter[], presets: readonly FilterPreset[], seen: Seeded = new Map()): SeedResult {
    const shipped = presets.map(shippedEntry).filter((e): e is SavedFilter => !!e);
    const names = new Set([...shipped.map((s) => s.name), ...seen.keys()]);
    const mine = existing.filter((s) => !names.has(s.name));
    const seeded = new Map(shipped.map((s) => [s.name, s.query] as const));
    return { list: [...shipped, ...mine], added: shipped, updated: [], removed: [], seeded };
}
export function defaultPreset(presets: readonly FilterPreset[] = []): FilterPreset | undefined {
    return presets.find((p) => p.default);
}
export function bootstrapSaved(presets: readonly FilterPreset[] = [], refresh = false): SavedFilter[] {
    const existing = loadSaved();
    if (!presets.length)
        return existing;
    const seen = loadSeeded();
    const { list, added, updated, removed, seeded } = refresh
        ? resetShipped(existing, presets, seen)
        : seedPresets(existing, presets, seen);
    if (added.length || updated.length || removed.length)
        storeSaved(list);
    storeSeeded(seeded);
    return list;
}
export function useSavedFilters(presets: readonly FilterPreset[] = [], refresh = false): [
    SavedFilter[],
    (next: readonly SavedFilter[]) => void
] {
    const [list, setList] = useState<SavedFilter[]>(() => bootstrapSaved(presets, refresh));
    const write = useCallback((next: readonly SavedFilter[]) => {
        const copy = [...next];
        storeSaved(copy);
        setList(copy);
    }, []);
    return [list, write];
}
