import { z } from "zod";
import { SCHEMAS, type LayerName } from "../../build/schema.js";
const formSchemas = new Map<LayerName, Record<string, unknown>>();
export function formSchemaFor(layer: LayerName): Record<string, unknown> {
    let cached = formSchemas.get(layer);
    if (!cached) {
        cached = z.toJSONSchema(SCHEMAS[layer], { io: "input" }) as Record<string, unknown>;
        formSchemas.set(layer, cached);
    }
    return cached;
}
export function defaultsFor(layer: LayerName): Record<string, unknown> {
    const props = (formSchemaFor(layer).properties ?? {}) as Record<string, {
        default?: unknown;
    }>;
    const defaults: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(props)) {
        if (spec && typeof spec === "object" && "default" in spec)
            defaults[key] = spec.default;
    }
    return defaults;
}
