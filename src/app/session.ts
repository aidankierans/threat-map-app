import { VIEW_KEY } from "./config.js";
import { formatView, parseColumns, parseFilters } from "./router.js";
import { DEFAULT_FILTERS, type FilterState } from "./selectors.js";
export interface WorkingView {
    filters: FilterState;
    columns: string[];
}
export const EMPTY_VIEW: WorkingView = { filters: DEFAULT_FILTERS, columns: [] };
export function loadWorkingView(): WorkingView | null {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(VIEW_KEY);
    }
    catch {
        return null;
    }
    if (raw === null)
        return null;
    return { filters: parseFilters(raw), columns: parseColumns(raw) };
}
export function storeWorkingView(view: WorkingView): void {
    try {
        localStorage.setItem(VIEW_KEY, formatView(view.filters, view.columns));
    }
    catch {
    }
}
