import { serviceRequest } from "./hosting.js";
import { parseCase } from "./case-codec.js";
import type { AnalysisDocument } from "./reader-state.js";
async function responseJson(response: Response): Promise<unknown> {
    if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Case-study sharing is unavailable. Sign in again or export a file.");
    const data = await response.json();
    if (!response.ok)
        throw new Error(typeof data?.error === "string" ? data.error : "Case-study sharing is unavailable.");
    return data;
}
export async function publishCase(doc: AnalysisDocument): Promise<string> {
    const data = await responseJson(await serviceRequest("cases", { body: parseCase(doc) })) as {
        id?: unknown;
    };
    if (typeof data.id !== "string" || !/^[a-f0-9]{64}$/.test(data.id))
        throw new Error("The sharing service returned an invalid reference.");
    return data.id;
}
export async function fetchSharedCase(id: string, signal?: AbortSignal): Promise<AnalysisDocument> {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error("Invalid shared case-study reference.");
    return parseCase(await responseJson(await serviceRequest("cases", { path: `/${id}`, signal })));
}
