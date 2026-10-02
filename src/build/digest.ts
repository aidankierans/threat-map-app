import { createHash } from "node:crypto";
import type { GraphIndex, ProseBundle } from "../types.js";
import type { MapBasis } from "../app/reader-state.js";
import { normalized, basisContent } from "../map-fingerprint.js";
export { normalized } from "../map-fingerprint.js";
export function digest(value: unknown): string { return createHash("sha256").update(normalized(value)).digest("hex"); }
export function mapBasis(index: GraphIndex, prose: ProseBundle): MapBasis {
    const content = basisContent(index, prose);
    return { revision: digest(content.revision), rulesVersion: 1, dependencies: content.dependencies.map(({ key, label, value }) => ({ key, label, digest: digest(value) })) };
}
