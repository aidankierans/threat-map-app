import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ROOT } from "./config.js";
import { SAVED_FILTER_KIND, type FilterPreset, type GraphIndex } from "../types.js";
const PRESET_DIR = "filters";
export interface PresetResult {
    presets: FilterPreset[];
    errors: string[];
}
export function loadPresets(): PresetResult {
    const abs = resolve(ROOT, PRESET_DIR);
    if (!existsSync(abs))
        return { presets: [], errors: [] };
    return parsePresetFiles(readdirSync(abs)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => ({
        source: relative(ROOT, join(abs, f)),
        text: readFileSync(join(abs, f), "utf8"),
    })));
}
export function parsePresetFiles(files: readonly {
    source: string;
    text: string;
}[]): PresetResult {
    const presets: FilterPreset[] = [];
    const errors: string[] = [];
    const claimed = new Map<string, string>();
    let defaultedBy: string | undefined;
    for (const { source, text } of files) {
        let data: unknown;
        try {
            data = JSON.parse(text);
        }
        catch {
            errors.push(`${source}: not valid JSON.`);
            continue;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            errors.push(`${source}: expected an object with \`kind\` and \`filters\`.`);
            continue;
        }
        const wrapper = data as {
            kind?: unknown;
            filters?: unknown;
        };
        if (wrapper.kind !== SAVED_FILTER_KIND) {
            errors.push(`${source}: \`kind\` is ${JSON.stringify(wrapper.kind)}, expected "${SAVED_FILTER_KIND}".`);
            continue;
        }
        if (!Array.isArray(wrapper.filters)) {
            errors.push(`${source}: \`filters\` is not a list.`);
            continue;
        }
        wrapper.filters.forEach((raw: unknown, i: number) => {
            const at = `${source}: filter ${i + 1}`;
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                errors.push(`${at} is not an object.`);
                return;
            }
            const entry = raw as {
                name?: unknown;
                query?: unknown;
                default?: unknown;
                description?: unknown;
                covers?: unknown;
                keeps?: unknown;
            };
            if (typeof entry.name !== "string" || !entry.name.trim()) {
                errors.push(`${at} has no name.`);
                return;
            }
            if (typeof entry.query !== "string") {
                errors.push(`${at} ("${entry.name}") has no query string.`);
                return;
            }
            if (entry.default !== undefined && typeof entry.default !== "boolean") {
                errors.push(`${at} ("${entry.name}") has a \`default\` that is not true or false.`);
                return;
            }
            const name = entry.name.replace(/\s+/g, " ").trim();
            const already = claimed.get(name);
            if (already) {
                errors.push(`${at} ("${name}") repeats a name already shipped by ${already}.`);
                return;
            }
            if (entry.default) {
                if (defaultedBy) {
                    errors.push(`${at} ("${name}") is a second \`default: true\` view; ${defaultedBy} already ` +
                        `claims the arrival state, and the map opens on one picture.`);
                    return;
                }
                defaultedBy = `${source} ("${name}")`;
            }
            if (entry.description !== undefined && typeof entry.description !== "string") {
                errors.push(`${at} ("${name}") has a \`description\` that is not a string.`);
                return;
            }
            const covers = entry.covers;
            if (covers !== undefined &&
                typeof covers !== "string" &&
                !(Array.isArray(covers) && covers.every((c) => typeof c === "string"))) {
                errors.push(`${at} ("${name}") has a \`covers\` that is not a name or a list of names.`);
                return;
            }
            const keeps = entry.keeps;
            if (keeps !== undefined &&
                !(Array.isArray(keeps) && keeps.every((k) => typeof k === "string"))) {
                errors.push(`${at} ("${name}") has a \`keeps\` that is not a list of names.`);
                return;
            }
            if (keeps !== undefined && covers === undefined) {
                errors.push(`${at} ("${name}") has \`keeps\` but no \`covers\`, so nothing would read it.`);
                return;
            }
            claimed.set(name, source);
            presets.push({
                name,
                query: entry.query,
                ...(entry.description ? { description: entry.description } : {}),
                ...(entry.default ? { default: true } : {}),
                ...(covers !== undefined ? { covers: covers as string | string[] } : {}),
                ...(keeps !== undefined ? { keeps: keeps as string[] } : {}),
                source,
            });
        });
    }
    return { presets, errors };
}
const ID_PARAMS = ["hide", "stack", "cond"] as const;
export function checkPresets(index: GraphIndex): string[] {
    const known = new Set<string>([
        ...index.nodes.map((n) => n.id),
        ...index.groups.map((g) => g.id),
        ...index.components.map((c) => c.id),
        ...(index.taxonomies.phase?.order ?? []),
    ]);
    const bandSize = new Map(index.groups.map((g) => [g.id, g.members.length]));
    const phases = new Set<string>(index.taxonomies.phase?.order ?? []);
    const inPhase = new Map<string, number>();
    for (const n of index.nodes) {
        if (n.phase)
            inPhase.set(n.phase, (inPhase.get(n.phase) ?? 0) + 1);
    }
    const membersOf = new Map<string, readonly string[]>(index.groups.map((g) => [g.id, g.members]));
    for (const p of phases) {
        membersOf.set(p, index.nodes.filter((n) => n.phase === p).map((n) => n.id));
    }
    const expand = (ids: readonly string[]) => ids.flatMap((id) => membersOf.get(id) ?? [id]);
    const warnings: string[] = [];
    for (const preset of index.presets) {
        const params = new URLSearchParams(preset.query);
        const missing: string[] = [];
        const empty: string[] = [];
        for (const param of ID_PARAMS) {
            const raw = params.get(param);
            if (!raw)
                continue;
            for (const id of raw.split(/[;,]/)) {
                const clean = id.trim().replace(/^[~-]/, "");
                if (!clean)
                    continue;
                if (!known.has(clean)) {
                    if (!missing.includes(clean))
                        missing.push(clean);
                    continue;
                }
                const size = phases.has(clean) ? (inPhase.get(clean) ?? 0) : bandSize.get(clean);
                if (size === 0 && !empty.includes(clean))
                    empty.push(clean);
            }
        }
        if (missing.length) {
            warnings.push(`${preset.source}: "${preset.name}" names ${missing.length} id${missing.length === 1 ? "" : "s"} this graph does not have: ${missing.join(", ")}`);
        }
        if (empty.length) {
            warnings.push(`${preset.source}: "${preset.name}" names ${empty.length} band${empty.length === 1 ? "" : "s"} with no members left, so it stands for nothing: ${empty.join(", ")}`);
        }
        if (preset.covers === undefined)
            continue;
        const claims = typeof preset.covers === "string" ? [preset.covers] : preset.covers;
        const scope = new Set<string>();
        for (const claim of claims) {
            const band = membersOf.get(claim);
            if (band?.length) {
                for (const id of band)
                    scope.add(id);
                continue;
            }
            const layer = index.nodes.filter((n) => n.layer === claim);
            if (layer.length) {
                for (const n of layer)
                    scope.add(n.id);
                continue;
            }
            warnings.push(`${preset.source}: "${preset.name}" declares \`covers\` over ` +
                `${JSON.stringify(claim)}, which holds no nodes, so the check it asks ` +
                `for cannot run.`);
        }
        if (!scope.size)
            continue;
        const accounted = new Set<string>([
            ...expand((params.get("hide") ?? "")
                .split(/[;,]/)
                .map((id) => id.trim().replace(/^[~-]/, ""))
                .filter(Boolean)),
            ...expand(preset.keeps ?? []),
        ]);
        const unaccounted = [...scope].filter((id) => !accounted.has(id)).sort();
        if (unaccounted.length) {
            warnings.push(`${preset.source}: "${preset.name}" covers ${scope.size} nodes but says nothing about ` +
                `${unaccounted.length} of them: ${unaccounted.join(", ")}. Hide them, or list them ` +
                `under \`keeps\` to say they are in this view deliberately.`);
        }
    }
    return warnings;
}
