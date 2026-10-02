import { DEFAULT_FILTERS, type FilterState, type HiddenSet } from "./selectors.js";
import type { EvidenceBucket } from "../types.js";
import { parseCaseRoute, formatCaseRoute, type CaseRoute } from "./case-route.js";
export type View = ({
    kind: "case";
} & CaseRoute) | {
    kind: "tree";
} | {
    kind: "questions";
} | {
    kind: "bibliography";
    source?: string;
} | {
    kind: "page";
    slug: string;
};
export interface RouteState {
    view: View;
    selection: string[];
    filters: FilterState;
    columns: string[];
}
export function viewKey(view: View): string {
    return view.kind === "page" ? `page:${view.slug}` : view.kind;
}
export function viewLabel(view: View, pages: ReadonlyArray<{
    slug: string;
    navLabel: string;
}>): string {
    switch (view.kind) {
        case "case":
            return "Case study";
        case "bibliography": return "Bibliography";
        case "questions":
            return "Research questions";
        case "page":
            return pages.find((p) => p.slug === view.slug)?.navLabel ?? view.slug;
        default:
            return "Threat map";
    }
}
export const DEFAULT_ROUTE: RouteState = {
    view: { kind: "tree" },
    selection: [],
    filters: DEFAULT_FILTERS,
    columns: [],
};
const LIST_PARAM: Record<string, "bucket"> = { bucket: "bucket" };
function parseHidden(raw: string | null): HiddenSet[] {
    if (!raw)
        return [];
    return raw
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => ({
        mode: part.startsWith("~") ? ("held" as const)
            : part.startsWith("-") ? ("shape" as const)
                : ("applied" as const),
        ids: part
            .replace(/^[~-]/, "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    }))
        .filter((set) => set.ids.length > 0);
}
const HIDE_MARK: Record<HiddenSet["mode"], string> = {
    applied: "",
    shape: "-",
    held: "~",
};
function formatHidden(sets: readonly HiddenSet[]): string {
    return sets
        .filter((set) => set.ids.length > 0)
        .map((set) => `${HIDE_MARK[set.mode]}${set.ids.join(",")}`)
        .join(";");
}
export function parseFilters(query: string): FilterState {
    const filters: FilterState = { ...DEFAULT_FILTERS };
    const params = new URLSearchParams(query);
    const list = (key: string): string[] => (params.get(key) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    for (const [key, field] of Object.entries(LIST_PARAM)) {
        if (!params.has(key))
            continue;
        void field;
        filters.bucket = list(key) as EvidenceBucket[];
    }
    filters.hidden = parseHidden(params.get("hide"));
    if (params.get("gates") === "partial")
        filters.showPartialGates = true;
    const story = params.get("story");
    if (story === "all" || story === "any")
        filters.story = story;
    const search = params.get("q");
    if (search !== null)
        filters.query = search;
    const fold = params.get("fold");
    const unfold = params.get("unfold");
    if (fold !== null) {
        const ids = list("fold").filter((id) => id !== "none");
        filters.fold = { all: false, except: ids };
    }
    else if (unfold !== null) {
        filters.fold = { all: true, except: list("unfold") };
    }
    return filters;
}
function foldParams(fold: FilterState["fold"], params: URLSearchParams): void {
    if (fold.all) {
        if (fold.except.length)
            params.set("unfold", fold.except.join(","));
    }
    else {
        params.set("fold", fold.except.length ? fold.except.join(",") : "none");
    }
}
export function parseColumns(query: string): string[] {
    return (new URLSearchParams(query).get("cols") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
function filterParams(f: FilterState): URLSearchParams {
    const params = new URLSearchParams();
    if (f.bucket)
        params.set("bucket", f.bucket.join(","));
    const hidden = formatHidden(f.hidden);
    if (hidden)
        params.set("hide", hidden);
    if (f.showPartialGates)
        params.set("gates", "partial");
    if (f.story)
        params.set("story", f.story);
    foldParams(f.fold, params);
    if (f.query.trim())
        params.set("q", f.query.trim());
    return params;
}
function readable(params: URLSearchParams): string {
    return params.toString().replace(/%2C/g, ",").replace(/%3B/g, ";").replace(/%7E/g, "~");
}
export function formatFilters(f: FilterState): string {
    return readable(filterParams(f));
}
export function formatView(f: FilterState, columns: readonly string[]): string {
    const params = filterParams(f);
    if (columns.length)
        params.set("cols", columns.join(","));
    return readable(params);
}
function pathOf(state: RouteState): string {
    switch (state.view.kind) {
        case "case":
            return formatCaseRoute(state.view).slice(1);
        case "bibliography": return `/bibliography${state.view.source ? `/${encodeURIComponent(state.view.source)}` : ""}`;
        case "questions":
            return "/questions";
        case "page":
            return `/page/${encodeURIComponent(state.view.slug)}`;
        default:
            return state.selection.length
                ? `/node/${state.selection.map(encodeURIComponent).join("+")}`
                : "/";
    }
}
export function parseHash(hash: string): RouteState {
    const caseRoute = parseCaseRoute(hash);
    if (caseRoute)
        return { ...DEFAULT_ROUTE, view: { kind: "case", ...caseRoute } };
    const raw = hash.replace(/^#\/?/, "");
    const [pathPart, queryPart] = raw.split("?");
    const segments = pathPart.split("/").filter(Boolean);
    let view: View = { kind: "tree" };
    let selection: string[] = [];
    if (segments[0] === "node" && segments[1]) {
        view = { kind: "tree" };
        selection = decodeURIComponent(segments[1])
            .split("+")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    else if (segments[0] === "bibliography") {
        view = { kind: "bibliography", ...(segments[1] ? { source: decodeURIComponent(segments[1]) } : {}) };
    }
    else if (segments[0] === "questions") {
        view = { kind: "questions" };
    }
    else if (segments[0] === "page" && segments[1]) {
        view = { kind: "page", slug: decodeURIComponent(segments[1]) };
    }
    const query = queryPart ?? "";
    return { view, selection, filters: parseFilters(query), columns: parseColumns(query) };
}
export function carriesView(hash: string): boolean {
    if (parseCaseRoute(hash))
        return false;
    const query = hash.replace(/^#\/?/, "").split("?")[1] ?? "";
    return query.length > 0;
}
export function buildHash(state: RouteState): string {
    return `#${pathOf(state)}`;
}
export function buildShareHash(state: RouteState): string {
    const query = formatView(state.filters, state.columns);
    return `#${pathOf(state)}${query ? `?${query}` : ""}`;
}
export function shareUrl(state: RouteState): string {
    const { origin, pathname, search } = window.location;
    const params = new URLSearchParams(search);
    params.delete("editor");
    return `${origin}${pathname}${params.size ? `?${params}` : ""}${buildShareHash(state)}`;
}
export function replaceHash(state: RouteState): void {
    const next = buildHash(state);
    if (window.location.hash !== next) {
        history.replaceState(null, "", next);
    }
}
export function pushHash(state: RouteState): void {
    const next = buildHash(state);
    if (window.location.hash !== next) {
        history.pushState(null, "", next);
    }
}
