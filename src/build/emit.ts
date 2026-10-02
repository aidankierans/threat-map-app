import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assemble } from "./assemble.js";
import { mapBasis, digest } from "./digest.js";
import { loadCaseStudies } from "./case-studies.js";
import { ROOT, graphLayers, layersConfig, taxonomies } from "./config.js";
import type { LoadedDoc } from "./load.js";
import type { DerivedGraph } from "./derive.js";
import type { FilterPreset, GraphIndex, ProseBundle, Reference } from "../types.js";
export interface EmitResult {
    index: GraphIndex;
    prose: ProseBundle;
    errors: string[];
}
export function emit(docs: LoadedDoc[], graph: DerivedGraph, references: Record<string, Reference>, presets: FilterPreset[], options: {
    write: boolean;
} = { write: true }): EmitResult {
    const { index, prose, errors } = assemble(docs, graph, references, presets, { graphLayers, layersConfig, taxonomies });
    index.generatedAt = process.env.BUILD_STAMP ?? "content-hash";
    index.mapBasis = mapBasis(index, prose);
    const cases = loadCaseStudies(index);
    index.caseStudies = cases.documents;
    errors.push(...cases.errors);
    if (options.write) {
        const indexDir = resolve(ROOT, "src/generated");
        const proseDir = resolve(ROOT, "public/data");
        mkdirSync(indexDir, { recursive: true });
        mkdirSync(proseDir, { recursive: true });
        writeFileSync(resolve(indexDir, "profile.json"), readFileSync(resolve(ROOT, "config/application.json"), "utf8"));
        writeFileSync(resolve(indexDir, "graph-index.json"), JSON.stringify(index));
        const { caseStudies, mapBasis: basis, sourceKeys, ...readerIndex } = index;
        writeFileSync(resolve(indexDir, "reader-index.json"), JSON.stringify({ ...readerIndex, mapBasis: basis ? { ...basis, dependencies: [] } : undefined }));
        writeFileSync(resolve(proseDir, "case-data.json"), JSON.stringify({ caseStudies, mapBasis: basis, sourceKeys }));
        writeFileSync(resolve(proseDir, "prose.json"), JSON.stringify(prose));
        writeFileSync(resolve(proseDir, "shared-content.json"), JSON.stringify(Object.fromEntries([
            ...Object.values(prose.references).map(({ key, ...fields }) => [`bibliography/${key}`, { authors: "", year: "", venue: "", urldate: "", ...fields }]),
            ...index.questions.map(q => [`questions/${q.id}`, { title: q.label, body: docs.find(d => d.meta.id === q.id)?.body ?? "", addresses: q.addresses.join(", "), bucket: q.bucket ?? "" }]),
        ])));
        const seed = { format: 1, docs, references, presets, config: { graphLayers, layersConfig, taxonomies } };
        writeFileSync(resolve(proseDir, "map-source.json"), JSON.stringify({ ...seed, revision: digest(seed) }));
    }
    return { index, prose, errors };
}
