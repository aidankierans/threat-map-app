export const WALKTHROUGH_STORAGE_KEY = "threat-map:walkthrough:v1";
export const WALKTHROUGH_REQUEST_EVENT = "threat-map:walkthrough";
type WalkthroughPreference = {
    dismissed: boolean;
    completed: boolean;
};
let sessionPreference: WalkthroughPreference = { dismissed: false, completed: false };
function preference(): WalkthroughPreference {
    try {
        return JSON.parse(localStorage.getItem(WALKTHROUGH_STORAGE_KEY) ?? "null") ?? { dismissed: false, completed: false };
    }
    catch {
        return sessionPreference;
    }
}
export function shouldInviteWalkthrough(): boolean {
    const value = preference();
    return !value.dismissed && !value.completed;
}
export function dismissWalkthroughInvitation(completed = false): void {
    sessionPreference = { dismissed: true, completed: completed || preference().completed };
    try {
        localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(sessionPreference));
    }
    catch { }
}
export function requestWalkthrough(): void {
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_REQUEST_EVENT));
}
