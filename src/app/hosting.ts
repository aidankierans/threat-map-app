export type Service = "map" | "content" | "cases" | "feedback";
export interface ServiceRequest {
    path?: string;
    body?: unknown;
    editor?: boolean;
    signal?: AbortSignal;
}
export interface HostingAdapter {
    feedbackAction?: string;
    request(service: Service, request: ServiceRequest): Promise<Response>;
    editorLoginUrl(next: string): string;
    capabilities: {
        sharing: boolean;
        feedback: boolean;
        history: boolean;
    };
}
const local: HostingAdapter = {
    capabilities: { sharing: false, feedback: false, history: false },
    editorLoginUrl: () => "",
    async request(service, request) {
        if (request.body === undefined && (service === "map" || service === "content"))
            return Response.json(service === "map"
                ? { editable: false, head: "base", baseRevision: "local", deployedRevision: "local", baseChanged: false, mode: "local", revisions: [], next: null }
                : { editable: false, revisions: [], mode: "local", next: null });
        throw new Error("This feature needs a hosting adapter. Save or export your work locally.");
    },
};
let adapter = local;
export function configureHosting(value: HostingAdapter): void { adapter = value; }
export function resetHosting(): void { adapter = local; }
export function hosting(): HostingAdapter { return adapter; }
export const serviceRequest = (service: Service, request: ServiceRequest = {}) => adapter.request(service, request);
export const editorLoginUrl = (next: string) => adapter.editorLoginUrl(next);
