import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { SCHEMAS, type LayerName } from "./schema.js";
import { ROOT, layerDirs } from "./config.js";
import { edgeId } from "../edge-id.js";
export interface LoadedDoc<T = any> {
    meta: T;
    body: string;
    source: string;
}
export interface LoadResult {
    docs: LoadedDoc[];
    errors: string[];
    warnings: string[];
}
function listMarkdown(dir: string): string[] {
    const abs = resolve(ROOT, dir);
    if (!existsSync(abs))
        return [];
    return readdirSync(abs)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => join(abs, f));
}
export function loadContent(): LoadResult {
    const docs: LoadedDoc[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const [layer, dir] of Object.entries(layerDirs)) {
        const schema = SCHEMAS[layer as LayerName];
        if (!schema) {
            errors.push(`config/layers.yaml declares layer "${layer}" (dir: ${dir}) but src/build/schema.ts ` +
                `has no SCHEMAS entry for it — every file in that directory is being ignored. ` +
                `Add a schema and register it under SCHEMAS.${layer.includes("-") ? `["${layer}"]` : layer}.`);
            continue;
        }
        for (const file of listMarkdown(dir)) {
            const source = relative(ROOT, file);
            const raw = readFileSync(file, "utf8");
            let parsed;
            try {
                parsed = matter(raw);
            }
            catch (e) {
                errors.push(`${source}: frontmatter is not valid YAML — ${(e as Error).message}`);
                continue;
            }
            const data = { layer, ...parsed.data };
            const result = schema.safeParse(data);
            if (!result.success) {
                for (const issue of result.error.issues) {
                    const path = issue.path.join(".");
                    errors.push(`${source}: ${path ? `${path}: ` : ""}${issue.message}`);
                }
                continue;
            }
            const known = new Set(Object.keys((schema as {
                shape?: object;
            }).shape ?? {}));
            for (const key of Object.keys(parsed.data)) {
                if (!known.has(key)) {
                    errors.push(`${source}: \`${key}:\` is not a field of a ${layer}, so nothing reads it. ` +
                        `Remove it, or correct the spelling.`);
                }
            }
            const meta = result.data as any;
            if (layer === "edge")
                meta.id = edgeId(meta.from, meta.to);
            const expected = `${meta.id ?? ""}.md`;
            const actual = file.split("/").pop()!;
            if (meta.id && actual !== expected) {
                errors.push(`${source}: filename must match id — expected ${expected}`);
                continue;
            }
            docs.push({ meta, body: parsed.content.trim(), source });
        }
    }
    return { docs, errors, warnings };
}
