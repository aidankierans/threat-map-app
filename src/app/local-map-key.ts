export const LOCAL_MAP_KEY = "threatmap-local-map";
export const LOCAL_MAP_DRAFTS_KEY = "threatmap-local-map-drafts";
/** Checked at startup without loading the editor, so readers without local edits download nothing extra. */
export function hasLocalMap(): boolean {
    try {
        return localStorage.getItem(LOCAL_MAP_KEY) !== null;
    }
    catch {
        return false;
    }
}
