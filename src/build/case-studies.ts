import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./config.js";
import { caseReview, parseCase, resolveRequirement } from "../app/case-codec.js";
import type { GraphIndex } from "../types.js";
import type { AnalysisDocument } from "../app/reader-state.js";
import { portableIndex } from '../app/portable-map.js';
export function loadCaseStudies(index: GraphIndex): {
    documents: AnalysisDocument[];
    errors: string[];
} {
    const dir = resolve(ROOT, "case-studies");
    const documents: AnalysisDocument[] = [];
    const errors: string[] = [];
    if (!existsSync(dir))
        return { documents, errors };
    for (const file of readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
        try {
            const doc = parseCase(readFileSync(resolve(dir, file), "utf8"), index);
            const caseIndex=doc.embeddedMap?portableIndex(doc.embeddedMap,doc.map):index;
            const missingSources = caseReview(doc, caseIndex).filter(issue => issue.startsWith("Unresolved source:"));
            if (missingSources.length)
                throw new Error(missingSources.join("; "));
            for (const id of [...doc.content.request.waypoints, ...doc.content.request.destinations])
                if (!caseIndex.nodes.some(n => n.id === id))
                    throw new Error(`Unresolved generation request ${id}`);
            for (const s of [...doc.content.stories, ...doc.content.archivedStories.map(a => a.story)])
                for (const o of s.occurrences) {
                    if (!caseIndex.nodes.some(n => n.id === o.node))
                        throw new Error(`Unresolved node ${o.node}`);
                    if (o.argument.kind === "requirement" && resolveRequirement(caseIndex, o.argument.ref).status !== "resolved")
                        throw new Error(`Unresolved requirement ${o.node}`);
                }
            if (documents.some(d => d.identity.revisionId === doc.identity.revisionId))
                throw new Error("Duplicate revision ID");
            documents.push(doc);
        }
        catch (error) {
            errors.push(`${file}: ${String(error)}`);
        }
    }
    return { documents, errors };
}
