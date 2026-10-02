import type { Reference } from "../types.js";
import type { LayersConfig } from "./config.js";
import type { Taxonomies } from "../types.js";
import type { LoadedDoc } from "./load.js";
import type { DerivedGraph } from "./derive.js";
import { edgeId } from "../edge-id.js";
import { leadSentence } from "./markdown.js";
export interface ValidationReport {
    errors: string[];
    warnings: string[];
}
export function validateCorpus(docs: LoadedDoc[], graph: DerivedGraph, references: Record<string, Reference>, config: {
    layersConfig: LayersConfig;
    taxonomies: Taxonomies;
}, options: {
    whole?: boolean;
} = {}): ValidationReport {
    const { layersConfig, taxonomies } = config;
    const errors: string[] = [];
    const warnings: string[] = [];
    const byId = new Map<string, LoadedDoc>();
    for (const doc of docs) {
        const id = doc.meta.id;
        if (byId.has(id)) {
            errors.push(`${doc.source}: duplicate id "${id}" (also in ${byId.get(id)!.source})`);
            continue;
        }
        byId.set(id, doc);
    }
    const layerOf = (id: string) => byId.get(id)?.meta.layer as string | undefined;
    const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
    const nameOf = (allowed: string[]): string => allowed.length === 1
        ? `${article(allowed[0])} ${allowed[0]}`
        : `one of ${allowed.join(", ")}`;
    for (const [gatedId, gate] of Object.entries(graph.gates)) {
        const doc = byId.get(gatedId);
        if (!doc)
            continue;
        const allowed = layersConfig.gates[doc.meta.layer as string];
        if (!allowed) {
            errors.push(`${doc.source}: a ${doc.meta.layer} declares enabled_by, but config/layers.yaml gives ` +
                `that layer no entry under \`gates:\`, so nothing says what a member of it may be.`);
            continue;
        }
        for (const group of gate) {
            for (const member of group.all) {
                if (!byId.has(member)) {
                    errors.push(`${doc.source}: enabled_by names "${member}", which does not exist`);
                }
                else if (!allowed.includes(layerOf(member)!)) {
                    errors.push(`${doc.source}: enabled_by names "${member}", which is ` +
                        `${article(layerOf(member)!)} ${layerOf(member)}. ` +
                        `${article(doc.meta.layer as string)} ${doc.meta.layer}'s gate is over ` +
                        `${nameOf(allowed)}.`);
                }
            }
        }
    }
    const derivedIds = new Set(graph.edges.map((e) => edgeId(e.from, e.to)));
    for (const doc of docs) {
        if (doc.meta.layer !== "edge")
            continue;
        const { from, to } = doc.meta;
        if (derivedIds.has(edgeId(from, to)))
            continue;
        if (derivedIds.has(edgeId(to, from))) {
            errors.push(`${doc.source}: no edge ${from} -> ${to}, but ${to} -> ${from} exists. An edge runs ` +
                `member -> gated node, which is the direction the gate is authored in and the ` +
                `direction the canvas draws, so from/to are swapped here.`);
        }
        else {
            errors.push(`${doc.source}: documents an edge ${from} -> ${to}, which no node's gate declares`);
        }
    }
    const GROUPS: Record<string, {
        memberLayer: string;
        dir: string;
    }> = {
        "condition-group": { memberLayer: "condition", dir: "content/condition-groups/" },
        consequence: { memberLayer: "event", dir: "content/consequences/" },
        "act-class": { memberLayer: "failure-mode", dir: "content/act-classes/" },
    };
    const groupsOfMember = new Map<string, string[]>();
    const kindOfGroup = new Map<string, string>();
    const rungOf = new Map<string, number>();
    for (const doc of docs) {
        const spec = GROUPS[doc.meta.layer as string];
        if (!spec)
            continue;
        kindOfGroup.set(doc.meta.id, doc.meta.kind as string);
        ((doc.meta.members ?? []) as string[]).forEach((member, i) => rungOf.set(member, i));
        for (const member of doc.meta.members ?? []) {
            if (!byId.has(member)) {
                errors.push(`${doc.source}: members names "${member}", which does not exist`);
            }
            else if (layerOf(member) !== spec.memberLayer) {
                errors.push(`${doc.source}: members names "${member}", which is not a ${spec.memberLayer}`);
            }
            if (!groupsOfMember.has(member))
                groupsOfMember.set(member, []);
            groupsOfMember.get(member)!.push(doc.meta.id);
        }
    }
    const ordersSeen = new Map<string, Map<number, string>>();
    for (const doc of docs) {
        if (!GROUPS[doc.meta.layer as string])
            continue;
        const order = doc.meta.order;
        if (typeof order !== "number")
            continue;
        const layer = doc.meta.layer as string;
        if (!ordersSeen.has(layer))
            ordersSeen.set(layer, new Map());
        const taken = ordersSeen.get(layer)!;
        const other = taken.get(order);
        if (other) {
            errors.push(`${doc.source}: order ${order} is already taken by ${other}. A group's order is its ` +
                `band's place down the column, so two bands cannot share one.`);
        }
        else {
            taken.set(order, doc.meta.id);
        }
    }
    for (const doc of docs) {
        const spec = Object.values(GROUPS).find((s) => s.memberLayer === doc.meta.layer);
        if (!spec)
            continue;
        const groups = groupsOfMember.get(doc.meta.id) ?? [];
        if (groups.length === 0) {
            errors.push(`${doc.source}: no group lists this ${doc.meta.layer}. Its group is where the band ` +
                `it is drawn in — and, for a condition, the question it answers — is written down. ` +
                `Add it to a ${spec.dir} file's \`members\`.`);
        }
        else if (groups.length > 1) {
            errors.push(`${doc.source}: listed by ${groups.length} groups (${groups.join(", ")}). ` +
                `A node is drawn in one band, so exactly one group may claim it.`);
        }
    }
    const bandOf = (id: string, kind: string): string | undefined => {
        const group = (groupsOfMember.get(id) ?? [])[0];
        return group && kindOfGroup.get(group) === kind ? group : undefined;
    };
    for (const [gatedId, gate] of Object.entries(graph.gates)) {
        const doc = byId.get(gatedId);
        if (!doc)
            continue;
        for (const group of gate) {
            if (group.all.length < 2)
                continue;
            const seen = new Map<string, string>();
            const onScale = new Map<string, string>();
            for (const member of group.all) {
                const partition = bandOf(member, "partition");
                if (partition) {
                    const other = seen.get(partition);
                    if (other) {
                        errors.push(`${doc.source}: one enabled_by group names both "${other}" and "${member}", which are ` +
                            `mutually exclusive members of ${partition}. A group is an AND, so this one can ` +
                            `never be satisfied — put them in separate groups if they are alternatives.`);
                    }
                    else {
                        seen.set(partition, member);
                    }
                    continue;
                }
                const scale = bandOf(member, "scale");
                if (!scale)
                    continue;
                const other = onScale.get(scale);
                if (other) {
                    const [earlier, later] = (rungOf.get(other) ?? 0) < (rungOf.get(member) ?? 0)
                        ? [other, member]
                        : [member, other];
                    warnings.push(`${doc.source}: one enabled_by group names both "${earlier}" and "${later}", two rungs ` +
                        `of ${scale}, which is a scale — "${later}" already entails "${earlier}", so naming ` +
                        `both adds nothing. Name the later rung alone unless the redundancy is deliberate.`);
                }
                else {
                    onScale.set(scale, member);
                }
            }
        }
    }
    for (const [gatedId, gate] of Object.entries(graph.gates)) {
        const doc = byId.get(gatedId);
        if (!doc || doc.meta.layer === "stage")
            continue;
        const covered = new Map<string, Set<number>>();
        for (const group of gate) {
            for (const member of group.all) {
                const partition = bandOf(member, "partition");
                const rung = rungOf.get(member);
                if (!partition || rung === undefined)
                    continue;
                if (!covered.has(partition))
                    covered.set(partition, new Set());
                covered.get(partition)!.add(rung);
            }
        }
        for (const [partition, rungs] of covered) {
            const members = (byId.get(partition)?.meta.members ?? []) as string[];
            const highest = Math.max(...rungs);
            const missing = members.filter((_, i) => i > highest);
            if (!missing.length)
                continue;
            warnings.push(`${doc.source}: its gate names "${members[highest]}" but no rung of ${partition} above ` +
                `it (${missing.join(", ")}). The rungs are exclusive, so an agent on ` +
                `a higher rung does not satisfy this gate — which says more standing enables less. ` +
                `Add a group for the higher rung, say why it forecloses this, or — if the rungs ` +
                `accumulate rather than exclude — make the group a scale.`);
        }
    }
    {
        const soleSource = new Map<string, Map<string, string>>();
        for (const doc of docs) {
            if (doc.meta.layer !== "condition")
                continue;
            const exclusive = bandOf(doc.meta.id, "partition");
            if (!exclusive)
                continue;
            for (const group of doc.meta.enabled_by ?? []) {
                if (group.all.length !== 1)
                    continue;
                const source = group.all[0]!;
                const perGroup = soleSource.get(source) ?? new Map<string, string>();
                soleSource.set(source, perGroup);
                const other = perGroup.get(exclusive);
                if (other) {
                    errors.push(`${doc.source}: "${source}" is named as a sufficient source on its own for both ` +
                        `"${other}" and "${doc.meta.id}", which are mutually exclusive members of ` +
                        `${exclusive}. One source cannot leave the world in two conditions of the same ` +
                        `group — these are branches, so pick one, or say what else has to hold.`);
                }
                else {
                    perGroup.set(exclusive, doc.meta.id);
                }
            }
        }
    }
    {
        const WIDE = 3;
        const subjectOfGroup = new Map<string, string>();
        for (const doc of docs) {
            if (doc.meta.layer !== "condition-group")
                continue;
            const subject = doc.meta.subject as string | undefined;
            if (subject)
                subjectOfGroup.set(doc.meta.id, subject);
        }
        const subjectsOf = (member: string) => (groupsOfMember.get(member) ?? [])
            .map((id) => subjectOfGroup.get(id))
            .filter((s): s is string => !!s);
        for (const doc of docs) {
            const gate = (doc.meta.enabled_by ?? []) as Array<{
                all?: string[];
                note?: string;
                partial?: boolean;
            }>;
            gate.forEach((group, i) => {
                if (group.partial && !group.note) {
                    errors.push(`${doc.source}: gate group ${i} is marked partial but carries no note. A partial ` +
                        `group asserts its conjuncts are not the whole set, so naming what is missing and ` +
                        `why it is out of scope is part of the declaration.`);
                }
            });
        }
        for (const doc of docs) {
            const gate = (doc.meta.enabled_by ?? []) as Array<{
                all?: string[];
                note?: string;
            }>;
            gate.forEach((group, i) => {
                if (group.note)
                    return;
                const subjects = new Set((group.all ?? []).flatMap(subjectsOf));
                if (subjects.size < WIDE)
                    return;
                warnings.push(`${doc.source}: gate group ${i} conjoins ${subjects.size} different subjects ` +
                    `(${[...subjects].join("; ")}) and carries no note. A group is a sufficient set, so ` +
                    `saying how its conjuncts bind is part of the claim — without it the conjunction is ` +
                    `satisfied by ${subjects.size} unrelated situations rather than by one incident.`);
            });
        }
    }
    for (const doc of docs) {
        if (doc.meta.layer === "condition" && (graph.outgoing[doc.meta.id] ?? []).length === 0) {
            warnings.push(`${doc.source}: no gate names this condition — a condition that bears on nothing is a label`);
        }
        if (doc.meta.layer === "failure-mode") {
            const establishes = (graph.outgoing[doc.meta.id] ?? []).some((t) => layerOf(t) === "condition");
            if (!establishes) {
                warnings.push(`${doc.source}: no condition's gate names this failure mode, so nothing downstream ` +
                    `depends on it. Add it to the requires of a condition it could bring about.`);
            }
        }
    }
    const tagOwners = new Map<string, string[]>();
    for (const doc of docs) {
        if (!Object.keys(layersConfig.layers).includes(doc.meta.layer))
            continue;
        const tag = doc.meta.tag ?? doc.meta.id.split("-").slice(1).join("-");
        if (!tagOwners.has(tag))
            tagOwners.set(tag, []);
        tagOwners.get(tag)!.push(doc.meta.id);
    }
    for (const [tag, owners] of tagOwners) {
        if (owners.length > 1) {
            warnings.push(`tag "${tag}" is drawn on ${owners.length} nodes: ${owners.join(", ")}`);
        }
    }
    for (const doc of docs) {
        for (const key of doc.meta.cites ?? []) {
            if (!references[key]) {
                errors.push(`${doc.source}: unknown citation key "${key}" (not in references/references.bib)`);
            }
        }
    }
    for (const doc of docs) {
        const m = doc.meta;
        for (const target of m.addresses ?? []) {
            if (!byId.has(target))
                errors.push(`${doc.source}: addresses unknown node "${target}"`);
        }
        if (m.parent) {
            if (!byId.has(m.parent)) {
                errors.push(`${doc.source}: parent "${m.parent}" does not exist`);
            }
            else if (layerOf(m.parent) !== m.layer) {
                errors.push(`${doc.source}: parent "${m.parent}" is a ${layerOf(m.parent)}, not a ${m.layer} — ` +
                    `a tree layer nests inside itself`);
            }
        }
    }
    for (const doc of docs) {
        const m = doc.meta;
        if (m.layer !== "component")
            continue;
        const seen = new Set<string>([m.id]);
        let cur = m.id;
        for (;;) {
            const parent: string | undefined = byId.get(cur)?.meta.parent;
            if (parent === undefined || !byId.has(parent))
                break;
            if (seen.has(parent)) {
                errors.push(`${doc.source}: parent chain cycles through "${parent}", so this component has no ` +
                    `root to band it`);
                break;
            }
            seen.add(parent);
            cur = parent;
        }
        if (m.parent === undefined && (graph.outgoing[m.id] ?? []).length > 0) {
            const naming = [...new Set(graph.outgoing[m.id]!)].sort();
            errors.push(`${doc.source}: a component with no parent is a band over its subtree, not a node in ` +
                `the column, so an edge leaving it could never be drawn. It is named in the gate of ` +
                `${naming.join(", ")} — name the child it is really about, or give this one a parent.`);
        }
    }
    const check = (doc: LoadedDoc, field: string, taxonomy: keyof typeof taxonomies) => {
        const value = doc.meta[field];
        if (value === undefined || value === null)
            return;
        const allowed = Object.keys((taxonomies[taxonomy] as any).values);
        if (!allowed.includes(value)) {
            errors.push(`${doc.source}: ${field} "${value}" is not in config/taxonomies.yaml (${allowed.join(", ")})`);
        }
    };
    for (const doc of docs) {
        check(doc, "evidence_bucket", "evidence_bucket");
        check(doc, "phase", "phase");
        check(doc, "context", "context");
        check(doc, "status", "status");
        check(doc, "provenance", "provenance");
    }
    type Explained = {
        tip?: string;
        description?: string;
    };
    const buckets = (taxonomies.evidence_bucket as {
        values: Record<string, Explained>;
    }).values;
    for (const [value, entry] of Object.entries(buckets)) {
        for (const field of ["tip", "description"] as const) {
            if (!entry[field]?.trim()) {
                errors.push(`config/taxonomies.yaml: evidence_bucket "${value}" has no \`${field}\`. Every bucket ` +
                    `reaches readers as a two-word chip, so without it the chip is undecodable.`);
            }
        }
    }
    if (options.whole) {
        const subject = (taxonomies as any).subject as {
            values?: Record<string, unknown>;
            parties?: Record<string, string>;
            overrides?: Record<string, string>;
        } | undefined;
        if (!subject) {
            errors.push(`config/taxonomies.yaml: no \`subject:\` block. The story generator reads it to say ` +
                `which part of the component stack stands for which kind of party; without it every ` +
                `generated story silently stops distinguishing an act aimed at another model from one ` +
                `aimed at a cluster.`);
        }
        else {
            const roles = Object.keys(subject.values ?? {});
            if (!roles.includes("substrate")) {
                errors.push(`config/taxonomies.yaml: \`subject.values\` has no "substrate" entry. It is the ` +
                    `fallback every component outside a named subtree resolves to, so it has to exist.`);
            }
            const components = new Set(docs.filter((d) => d.meta.layer === "component").map((d) => d.meta.id as string));
            for (const [key, table] of [
                ["parties", subject.parties ?? {}],
                ["overrides", subject.overrides ?? {}],
            ] as const) {
                for (const [id, role] of Object.entries(table)) {
                    if (!components.has(id)) {
                        errors.push(`config/taxonomies.yaml: \`subject.${key}\` names "${id}", which is not a ` +
                            `component. Nothing would ever resolve to it, so the role it declares is dead.`);
                    }
                    if (!roles.includes(role)) {
                        errors.push(`config/taxonomies.yaml: \`subject.${key}.${id}\` is "${role}", which is not one ` +
                            `of \`subject.values\` (${roles.join(", ")}).`);
                    }
                }
            }
        }
    }
    const idPrefixes = new Set([...byId.keys()].map((id) => id.split("-")[0]).filter((p): p is string => Boolean(p)));
    const bareId = new RegExp(String.raw `(?<![A-Za-z0-9~\-])(${[...idPrefixes].join("|")})-[A-Za-z0-9][A-Za-z0-9-]*`, "g");
    for (const doc of docs) {
        const seen = new Set<string>();
        for (const [token] of doc.body.matchAll(bareId)) {
            if (byId.has(token) || seen.has(token))
                continue;
            seen.add(token);
            errors.push(`${doc.source}: prose names "${token}", which is not the id of anything. ` +
                `Name a node that exists, or say it in words.`);
        }
    }
    for (const doc of docs) {
        const m = doc.meta;
        if (["stage", "affordance", "failure-mode"].includes(m.layer)) {
            if ((m.cites ?? []).length === 0 && !m.needs_citation) {
                warnings.push(`${doc.source}: no citations and needs_citation is false`);
            }
        }
        if (m.needs_citation) {
            warnings.push(`${doc.source}: flagged as needing citations`);
        }
        if (Object.keys(layersConfig.layers).includes(m.layer) && doc.body.trim() === "") {
            warnings.push(`${doc.source}: no body, so its hover preview opens empty`);
        }
        const hasLead = Object.keys(layersConfig.layers).includes(m.layer) ||
            m.layer === "edge" ||
            ((layersConfig.layers[m.layer] ?? layersConfig.auxiliary?.[m.layer])?.declares ?? []).includes("members");
        if (hasLead && leadSentence(doc.body).endsWith("…")) {
            warnings.push(`${doc.source}: its first sentence is longer than the hover card shows, so the ` +
                `preview and any story quoting it are cut off mid-clause. Split the sentence.`);
        }
    }
    for (const doc of docs) {
        const m = doc.meta;
        const isGraphLayer = Object.keys(layersConfig.layers).includes(m.layer);
        if (!isGraphLayer)
            continue;
        if (m.layer === "component")
            continue;
        const hasIn = (graph.incoming[m.id] ?? []).length > 0;
        const hasOut = (graph.outgoing[m.id] ?? []).length > 0;
        if (!hasIn && !hasOut)
            warnings.push(`${doc.source}: node is not connected to anything`);
    }
    return { errors, warnings };
}
