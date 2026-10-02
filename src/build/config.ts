import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { LayerConfig, LayerName, LayerRole, Taxonomies } from "../types.js";
export const ROOT = resolve(process.env.THREAT_MAP_ROOT ?? process.cwd());
export interface LayerSpec {
    label: string;
    role: LayerRole;
    dir: string;
    hue: string;
    declares: string[];
}
export interface LayersConfig {
    graphs: Record<string, {
        label: string;
        description: string;
        layers: LayerName[];
    }>;
    layers: Record<string, LayerSpec>;
    auxiliary: Record<string, {
        label: string;
        dir: string;
        declares: string[];
    }>;
    gates: Record<string, string[]>;
}
function readYaml<T>(relative: string): T {
    return parseYaml(readFileSync(resolve(ROOT, relative), "utf8")) as T;
}
export const layersConfig = readYaml<LayersConfig>("config/layers.yaml");
export const taxonomies = readYaml<Taxonomies>("config/taxonomies.yaml");
export function checkLayersConfig(config: LayersConfig): string[] {
    const problems: string[] = [];
    const defined = new Set(Object.keys(config.layers));
    const placed = new Set<string>();
    for (const [graph, spec] of Object.entries(config.graphs ?? {})) {
        for (const name of spec.layers ?? []) {
            if (!defined.has(name)) {
                problems.push(`config/layers.yaml: graph "${graph}" lists layer "${name}", which has no entry under \`layers:\`.`);
            }
            placed.add(name);
        }
    }
    for (const name of defined) {
        if (!placed.has(name)) {
            problems.push(`config/layers.yaml: layer "${name}" is defined but appears in no graph's \`layers:\` list, so it would never be drawn.`);
        }
    }
    for (const [gated, members] of Object.entries(config.gates ?? {})) {
        if (!defined.has(gated)) {
            problems.push(`config/layers.yaml: \`gates:\` has an entry for "${gated}", which has no entry under ` +
                `\`layers:\`. Nothing would read it, so that layer's gates would go unchecked.`);
        }
        for (const member of members ?? []) {
            if (!defined.has(member)) {
                problems.push(`config/layers.yaml: \`gates:\` lets a ${gated}'s gate name a "${member}", which has ` +
                    `no entry under \`layers:\`. No node can ever be one, so the entry is dead.`);
            }
        }
    }
    return problems;
}
const configProblems = checkLayersConfig(layersConfig);
if (configProblems.length)
    throw new Error(configProblems.join("\n"));
export const spineOrder: string[] = Object.values(layersConfig.graphs ?? {})[0]?.layers ?? [];
export const graphLayers: LayerConfig[] = Object.entries(layersConfig.layers)
    .map(([name, spec]) => ({
    name: name as LayerName,
    label: spec.label,
    role: spec.role,
    hue: spec.hue,
}))
    .sort((a, b) => rank(a) - rank(b));
function rank(layer: LayerConfig): number {
    if (layer.role !== "spine")
        return Number.MAX_SAFE_INTEGER;
    const i = spineOrder.indexOf(layer.name);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}
export const columnOfLayer = new Map(graphLayers.filter((l) => l.role === "spine").map((l, i) => [l.name as string, i]));
export const layerDirs: Record<string, string> = {
    ...Object.fromEntries(Object.entries(layersConfig.layers).map(([k, v]) => [k, v.dir])),
    ...Object.fromEntries(Object.entries(layersConfig.auxiliary).map(([k, v]) => [k, v.dir])),
    edge: "content/edges",
};
export function allowedValues(taxonomy: keyof Taxonomies): string[] {
    const t = taxonomies[taxonomy] as {
        values: Record<string, unknown>;
    };
    return Object.keys(t.values);
}
