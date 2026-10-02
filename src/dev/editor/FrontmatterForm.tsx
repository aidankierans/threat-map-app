import { useMemo, useState } from "preact/hooks";
import type { GraphIndex } from "../../types.js";
import type { DocPayload } from "./api.js";
const EXCLUDED = new Set(["id", "layer", "from", "to", "kind", "slug", "evidence_bucket", "bucket_note"]);
type Spec = {
    type?: string | string[];
    enum?: string[];
    anyOf?: Spec[];
    items?: Spec;
    properties?: Record<string, Spec>;
    minimum?: number;
    maximum?: number;
    default?: unknown;
};
export type FieldKind = {
    t: "enum";
    options: string[];
} | {
    t: "boolean";
} | {
    t: "string";
} | {
    t: "number";
    min?: number;
    max?: number;
    nullable: boolean;
} | {
    t: "string-array";
} | {
    t: "object";
    fields: Record<string, FieldKind>;
} | {
    t: "object-array";
    fields: Record<string, FieldKind>;
} | {
    t: "opaque";
};
export function interpret(spec: Spec): FieldKind {
    if (spec.enum)
        return { t: "enum", options: spec.enum };
    if (spec.anyOf) {
        const nonNull = spec.anyOf.filter((s) => s.type !== "null");
        const nullable = nonNull.length < spec.anyOf.length;
        if (nonNull.length === 1) {
            const inner = interpret(nonNull[0]);
            return inner.t === "number" ? { ...inner, nullable } : inner;
        }
        return { t: "opaque" };
    }
    switch (spec.type) {
        case "boolean":
            return { t: "boolean" };
        case "string":
            return { t: "string" };
        case "number":
        case "integer":
            return { t: "number", min: spec.minimum, max: spec.maximum, nullable: false };
        case "array": {
            const items = spec.items ? interpret(spec.items) : { t: "opaque" as const };
            if (items.t === "string" || items.t === "enum")
                return { t: "string-array" };
            if (items.t === "object")
                return { t: "object-array", fields: items.fields };
            return { t: "opaque" };
        }
        case "object":
            return spec.properties
                ? {
                    t: "object",
                    fields: Object.fromEntries(Object.entries(spec.properties).map(([k, v]) => [k, interpret(v)])),
                }
                : { t: "opaque" };
        default:
            return { t: "opaque" };
    }
}
export interface FormProps {
    doc: DocPayload;
    index: GraphIndex;
    onCommit: (patch: {
        set?: Record<string, unknown>;
        unset?: string[];
    }) => Promise<string[]>;
}
export function FrontmatterForm({ doc, index, onCommit }: FormProps) {
    const [strip, setStrip] = useState<string[]>([]);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const fields = useMemo(() => {
        const props = (doc.formSchema.properties ?? {}) as Record<string, Spec>;
        return Object.entries(props)
            .filter(([name]) => !EXCLUDED.has(name))
            .map(([name, spec]) => ({ name, spec, kind: interpret(spec) }));
    }, [doc.formSchema]);
    const valueOf = (name: string): unknown => name in values ? values[name] : doc.frontmatter[name];
    const commit = async (name: string, value: unknown, remove = false) => {
        setValues((v) => ({ ...v, [name]: value }));
        const lines = await onCommit(remove ? { unset: [name] } : { set: { [name]: value } });
        setStrip(lines);
    };
    const labelFor = (field: string, option: string): string => {
        const taxonomies = index.taxonomies as unknown as Record<string, {
            values?: Record<string, {
                label?: string;
            }>;
        } | undefined>;
        const label = taxonomies[field]?.values?.[option]?.label;
        return label ? `${option} — ${label}` : option;
    };
    return (<div class="edt-form">
      {fields.map(({ name, spec, kind }) => (<Field key={name} name={name} kind={kind} value={valueOf(name)} fallback={spec.default} labelFor={labelFor} onCommit={commit}/>))}
      {strip.length > 0 && (<div class="edt-strip">
          {strip.map((line) => (<div key={line}>✗ {line}</div>))}
        </div>)}
    </div>);
}
function Field({ name, kind, value, fallback, labelFor, onCommit, }: {
    name: string;
    kind: FieldKind;
    value: unknown;
    fallback: unknown;
    labelFor: (field: string, option: string) => string;
    onCommit: (name: string, value: unknown, remove?: boolean) => Promise<void>;
}) {
    const label = <label class="edt-form-label">{name.replace(/_/g, " ")}</label>;
    switch (kind.t) {
        case "enum": {
            const current = (value ?? fallback ?? "") as string;
            return (<div class="edt-form-row">
          {label}
          <select value={current} onChange={(e) => void onCommit(name, e.currentTarget.value)}>
            {value === undefined && fallback === undefined && <option value="">—</option>}
            {kind.options.map((o) => (<option key={o} value={o}>
                {labelFor(name, o)}
              </option>))}
          </select>
        </div>);
        }
        case "boolean":
            return (<div class="edt-form-row">
          {label}
          <input type="checkbox" checked={Boolean(value ?? fallback ?? false)} onChange={(e) => void onCommit(name, e.currentTarget.checked)}/>
        </div>);
        case "string":
            return (<div class="edt-form-row">
          {label}
          <input type="text" value={(value as string) ?? ""} placeholder={typeof fallback === "string" ? fallback : undefined} onChange={(e) => {
                    const text = e.currentTarget.value;
                    void onCommit(name, text, text === "");
                }}/>
        </div>);
        case "number":
            return (<div class="edt-form-row">
          {label}
          <input type="number" value={value === null || value === undefined ? "" : String(value)} min={kind.min} max={kind.max} step="any" onChange={(e) => {
                    const text = e.currentTarget.value.trim();
                    if (text === "")
                        void onCommit(name, null, !kind.nullable);
                    else
                        void onCommit(name, Number(text));
                }}/>
        </div>);
        case "string-array":
            return (<ArrayField name={name} value={value} label={label} onCommit={onCommit}/>);
        case "object":
        case "object-array":
            return (<JsonField name={name} value={value} label={label} onCommit={onCommit}/>);
        default:
            return null;
    }
}
function ArrayField({ name, value, label, onCommit, }: {
    name: string;
    value: unknown;
    label: preact.JSX.Element;
    onCommit: (name: string, value: unknown, remove?: boolean) => Promise<void>;
}) {
    const current = Array.isArray(value) ? (value as string[]).join(", ") : "";
    return (<div class="edt-form-row">
      {label}
      <input type="text" value={current} placeholder="a, b, c" onChange={(e) => {
            const items = e.currentTarget.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            void onCommit(name, items, items.length === 0);
        }}/>
    </div>);
}
function JsonField({ name, value, label, onCommit, }: {
    name: string;
    value: unknown;
    label: preact.JSX.Element;
    onCommit: (name: string, value: unknown, remove?: boolean) => Promise<void>;
}) {
    const pretty = value === undefined ? "" : JSON.stringify(value, null, 1);
    const [draft, setDraft] = useState<string | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const dirty = draft !== null && draft !== pretty;
    return (<div class="edt-form-row edt-form-json">
      {label}
      <textarea rows={Math.min(8, Math.max(2, (draft ?? pretty).split("\n").length))} value={draft ?? pretty} spellcheck={false} onInput={(e) => setDraft(e.currentTarget.value)}/>
      {dirty && (<button class="edt-btn" onClick={() => {
                try {
                    const parsed = draft!.trim() === "" ? undefined : JSON.parse(draft!);
                    setParseError(null);
                    void onCommit(name, parsed, parsed === undefined).then(() => setDraft(null));
                }
                catch (err) {
                    setParseError((err as Error).message);
                }
            }}>
          apply
        </button>)}
      {parseError && <div class="edt-strip">✗ not JSON yet: {parseError}</div>}
    </div>);
}
