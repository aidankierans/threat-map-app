import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./config.js";
import { readReferences } from "./bibtex.js";
import { loadContent, type LoadedDoc } from "./load.js";
import { deriveGraph } from "./derive.js";
import { validate } from "./validate.js";
import { emit } from "./emit.js";
import { checkPresets, loadPresets } from "./presets.js";
import type { GraphIndex, ProseBundle, Reference } from "../types.js";
export interface BuildResult {
    docs: LoadedDoc[];
    references: Record<string, Reference>;
    index: GraphIndex;
    prose: ProseBundle;
    errors: string[];
    warnings: string[];
}
export function runBuild(options: {
    write?: boolean;
} = {}): BuildResult {
    const write = options.write ?? true;
    const bibPath = resolve(ROOT, "references/references.bib");
    const references = existsSync(bibPath) ? readReferences(readFileSync(bibPath, "utf8")) : {};
    const { docs, errors: loadErrors, warnings: loadWarnings } = loadContent();
    const graph = deriveGraph(docs);
    const { errors: validationErrors, warnings } = validate(docs, graph, references, {
        whole: true,
    });
    const { presets, errors: presetErrors } = loadPresets();
    const { index, prose, errors: renderErrors } = emit(docs, graph, references, presets, { write });
    return {
        docs,
        references,
        index,
        prose,
        errors: [...loadErrors, ...validationErrors, ...renderErrors, ...presetErrors],
        warnings: [...loadWarnings, ...warnings, ...checkPresets(index)],
    };
}
