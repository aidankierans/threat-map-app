import { layersConfig, taxonomies } from "./config.js";
import { validateCorpus } from "./validate-core.js";
import type { LoadedDoc } from "./load.js";
import type { DerivedGraph } from "./derive.js";
import type { Reference } from "../types.js";
export type { ValidationReport } from "./validate-core.js";
export function validate(docs: LoadedDoc[], graph: DerivedGraph, references: Record<string, Reference>, options: {
    whole?: boolean;
} = {}) {
    return validateCorpus(docs, graph, references, { layersConfig, taxonomies }, options);
}
