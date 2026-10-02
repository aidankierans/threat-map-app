import { z } from "zod";
import type { GraphIndex } from "../types.js";
import { scaleSatisfiers } from "../scale.js";
import type { AnalysisDocument, RequirementRef, AnalysisStory, DeploymentContext, ReaderJudgment, StoryContraction } from "./reader-state.js";
export const MAX_CASE_BYTES = 1024 * 1024;
const text = z.string().max(32000);
const id = z.string().min(1).max(256);
const list = <T extends z.ZodType>(s: T) => z.array(s).max(4096);
const obj = z.strictObject;
const requirement = obj({ target: id, all: list(id).min(1), partial: z.boolean(), note: text });
const ref = obj({ story: id, occurrence: id });
const target = obj({ kind: z.enum(["occurrence", "transition"]), story: id, occurrence: id });
const source = obj({ label: text, reference: z.discriminatedUnion("kind", [
        obj({ kind: z.literal("citation"), key: id }),
        obj({ kind: z.literal("url"), url: text.refine(s => { try {
                return ["http:", "https:"].includes(new URL(s).protocol);
            }
            catch {
                return false;
            } }) }),
        obj({ kind: z.literal("text"), text }),
    ]) });
const basis = { note: text, sources: list(source) };
const judgment = obj({ id, target, value: z.enum(["supported", "assumed", "uncertain", "absent", "disputed", "disputed-assumption"]), ...basis });
const contraction = obj({ story: id, through: id });
const story = obj({ id, title: text, occurrences: list(obj({ id, node: id, scope: id,
        presentation: obj({ label: text.optional(), subtitle: text.optional(), status: text.optional(), bucket: text.optional(), needsCitation: z.boolean().optional(), assumption: text.optional() }).optional(),
        argument: z.discriminatedUnion("kind", [obj({ kind: z.literal("premise") }), obj({ kind: z.literal("requirement"), ref: requirement, members: list(obj({ declared: id, occurrence: id })) })]),
    })).min(1), destinationOccurrence: id, waypointOccurrences: list(id) });
const context = obj({ title: text, description: text,
    scopes: list(obj({ id, actor: id, system: text, moment: text })),
    facts: list(obj({ id, scope: id, kind: z.enum(["component", "permission", "stage", "condition"]), label: text, description: text })),
    mappings: list(obj({ id, target, facts: list(id), relation: z.enum(["match", "difference", "unknown"]), effect: z.enum(["applies", "blocks", "unresolved"]), ...basis })),
});
const map = obj({ revision: id, rulesVersion: z.number().int().positive(), dependencies: list(obj({ key: text, digest: id, label: text })) });
const identity = obj({ analysisId: id, revisionId: id });
const route = obj({ view: z.discriminatedUnion("kind", [obj({ kind: z.literal("tree") }), obj({ kind: z.literal("questions") }), obj({ kind: z.literal("bibliography") }), obj({ kind: z.literal("page"), slug: id })]),
    selection: list(id), columns: list(id), filters: obj({ bucket: list(z.enum(["eval", "private", "assessment", "hard"])).nullable(),
        hidden: list(obj({ mode: z.enum(["applied", "shape", "held"]), ids: list(id) })),
        showPartialGates: z.boolean(), story: z.enum(["all", "any"]).nullable(), query: text,
        fold: obj({ all: z.boolean(), except: list(id) }),
    }),
});
export const caseSchema = obj({ kind: z.literal("threat-map/analysis"), schemaVersion: z.literal(1), identity, parent: identity.optional(), createdAt: text,
    map, content: obj({ title: text, question: text.optional(), premise: text, interpretation: text, context, view: route,
        actors: list(obj({ id, label: text, kind: z.enum(["ai", "human", "population"]) })),
        request: obj({ waypoints: list(id), destinations: list(id), mode: z.enum(["all", "any"]) }),
        stories: list(story), archivedStories: list(obj({ story, map, context, judgments: list(judgment), contractions: list(contraction) })),
        judgments: list(judgment), contractions: list(contraction),
        presentation: obj({ steps: list(obj({ id, kind: z.enum(["moment", "caption"]), title: text, caption: text,
                narrative: text.optional(),
                occurrences: list(ref), actors: list(obj({ actor: id, at: ref })), introduces: list(id), contractions: list(contraction),
                origin: z.enum(["derived", "authored"]), acknowledgedOutOfOrder: z.literal(true).optional(),
            })).min(1) }),
    }),
});
export function requirementKey(r: RequirementRef): string {
    return JSON.stringify([r.target, [...r.all].sort(), r.partial, r.note]);
}
export function resolveRequirement(index: GraphIndex, r: RequirementRef): {
    status: "resolved";
    group: number;
} | {
    status: "missing" | "ambiguous";
} {
    const found = (index.gates[r.target] ?? []).flatMap((g, i) => requirementKey({ target: r.target, all: g.all, partial: !!g.partial, note: g.note ?? "" }) === requirementKey(r) ? [i] : []);
    return found.length === 1 ? { status: "resolved", group: found[0] } : { status: found.length ? "ambiguous" : "missing" };
}
export function parseCase(input: string | unknown, index?: GraphIndex): AnalysisDocument {
    const raw = typeof input === "string" ? input : JSON.stringify(input);
    if (new TextEncoder().encode(raw).length > MAX_CASE_BYTES)
        throw new Error("Case study exceeds the 1 MiB file limit.");
    const doc = caseSchema.parse(JSON.parse(raw)) as AnalysisDocument;
    delete (doc.content as unknown as {
        question?: string;
    }).question;
    const fail = (message: string): never => { throw new Error(`Invalid case study: ${message}`); };
    const unique = (ids: string[], what: string) => { if (new Set(ids).size !== ids.length)
        fail(`duplicate ${what}`); };
    const c = doc.content;
    unique(c.actors.map(a => a.id), "actor");
    unique(doc.map.dependencies.map(d => d.key), "map dependency");
    unique([...c.stories, ...c.archivedStories.map(a => a.story)].map(s => s.id), "story");
    const actors = new Set(c.actors.map(a => a.id));
    const validateSet = (stories: AnalysisStory[], ctx: DeploymentContext, judgments: ReaderJudgment[], contractions: StoryContraction[]) => {
        unique(ctx.scopes.map(s => s.id), "scope");
        unique(ctx.facts.map(f => f.id), "fact");
        unique(ctx.mappings.map(m => m.id), "mapping");
        for (const s of ctx.scopes)
            if (!actors.has(s.actor))
                fail(`unknown actor ${s.actor}`);
        const scopes = new Map(ctx.scopes.map(s => [s.id, s]));
        for (const f of ctx.facts)
            if (!scopes.has(f.scope))
                fail(`unknown fact scope ${f.scope}`);
        const lookup = (r: {
            story: string;
            occurrence: string;
        }) => {
            const o = stories.find(s => s.id === r.story)?.occurrences.find(o => o.id === r.occurrence);
            return o ?? fail(`unknown local claim ${r.story}/${r.occurrence}`);
        };
        for (const s of stories) {
            unique(s.occurrences.map(o => o.id), "claim");
            const byId = new Map(s.occurrences.map(o => [o.id, o]));
            for (const o of s.occurrences) {
                if (!scopes.has(o.scope))
                    fail(`unknown scope ${o.scope}`);
                if (o.argument.kind === "premise")
                    continue;
                const a = o.argument;
                if (a.ref.target !== o.node)
                    fail("argument target differs from claim");
                unique(a.ref.all, "requirement member");
                unique(a.members.map(m => m.declared), "supplied member");
                if (a.ref.all.some((id, i) => id !== [...a.ref.all].sort()[i]))
                    fail("requirement members must be sorted");
                if (JSON.stringify([...a.ref.all].sort()) !== JSON.stringify(a.members.map(m => m.declared).sort()))
                    fail("incomplete argument members");
                for (const m of a.members) {
                    const supplier = byId.get(m.occurrence) ?? fail("unknown supplying claim");
                    if (supplier.node !== m.declared) {
                        const x = scopes.get(o.scope)!;
                        const y = scopes.get(supplier.scope)!;
                        if (x.actor !== y.actor || x.system !== y.system || x.moment !== y.moment)
                            fail("scale substitution crosses scope");
                        if (index && doc.map.revision === index.mapBasis?.revision && !scaleSatisfiers(index.groups)(m.declared).includes(supplier.node))
                            fail("invalid scale substitution");
                    }
                }
            }
            const visited = new Set<string>();
            const visiting = new Set<string>();
            const walk = (id: string) => {
                const o = byId.get(id) ?? fail("unknown destination or waypoint");
                if (visiting.has(id))
                    fail("cyclic captured argument");
                if (visited.has(id))
                    return;
                visiting.add(id);
                if (o.argument.kind === "requirement")
                    for (const m of o.argument.members)
                        walk(m.occurrence);
                visiting.delete(id);
                visited.add(id);
            };
            walk(s.destinationOccurrence);
            for (const id of s.waypointOccurrences)
                if (!visited.has(id))
                    fail("waypoint outside destination argument");
            for (const o of s.occurrences)
                walk(o.id);
        }
        unique(judgments.map(j => j.id), "judgment");
        unique(judgments.map(j => JSON.stringify([j.target.kind, j.target.story, j.target.occurrence])), "judgment target");
        for (const choice of [...judgments, ...ctx.mappings]) {
            const o = lookup(choice.target);
            if (choice.target.kind === "transition" && o.argument.kind !== "requirement")
                fail("premise cannot have a transition judgment");
        }
        for (const m of ctx.mappings) {
            if (m.relation === "unknown" && m.effect !== "unresolved")
                fail("unknown mapping must remain unresolved");
            for (const f of m.facts)
                if (!ctx.facts.some(x => x.id === f))
                    fail("unknown mapped fact");
        }
        for (const r of contractions)
            lookup({ story: r.story, occurrence: r.through });
        return lookup;
    };
    const lookup = validateSet(c.stories, c.context, c.judgments, c.contractions);
    for (const a of c.archivedStories)
        validateSet([a.story], a.context, a.judgments, a.contractions);
    unique(c.presentation.steps.map(s => s.id), "step");
    const narrated = new Set<string>();
    for (const s of c.presentation.steps) {
        if (s.kind === "caption" && s.occurrences.length)
            fail("caption steps cannot establish claims");
        unique(s.actors.map(a => a.actor), "placement");
        for (const r of s.occurrences) {
            lookup(r);
            const key = JSON.stringify([r.story, r.occurrence]);
            if (narrated.has(key))
                fail("claim appears in multiple steps");
            narrated.add(key);
        }
        for (const p of s.actors) {
            if (!actors.has(p.actor))
                fail("unknown placed actor");
            lookup(p.at);
        }
        for (const j of s.introduces)
            if (!c.judgments.some(x => x.id === j))
                fail("unknown introduced judgment");
        for (const r of s.contractions)
            lookup({ story: r.story, occurrence: r.through });
    }
    return doc;
}
export function caseReview(doc: AnalysisDocument, index: GraphIndex): string[] {
    const issues: string[] = [];
    for (const s of [...doc.content.stories, ...doc.content.archivedStories.map(a => a.story)])
        for (const o of s.occurrences) {
            if (!index.nodes.some(n => n.id === o.node))
                issues.push(`Missing map claim: ${o.node}`);
            if (o.argument.kind === "requirement") {
                const result = resolveRequirement(index, o.argument.ref);
                if (result.status !== "resolved")
                    issues.push(`${result.status} requirement: ${o.node}`);
            }
        }
    for (const dep of doc.map.dependencies)
        if (index.mapBasis?.dependencies.find(d => d.key === dep.key)?.digest !== dep.digest)
            issues.push(`Changed map dependency: ${dep.label}`);
    const knownSources = new Set(index.mapBasis?.dependencies.filter(d => d.key.startsWith("source:")).map(d => d.key.slice(7)) ?? []);
    const bases = [...doc.content.judgments, ...doc.content.context.mappings, ...doc.content.archivedStories.flatMap(a => [...a.judgments, ...a.context.mappings])];
    for (const basis of bases)
        for (const s of basis.sources)
            if (s.reference.kind === "citation" && !knownSources.has(s.reference.key))
                issues.push(`Unresolved source: ${s.reference.key}`);
    for (const match of JSON.stringify(doc.content).matchAll(/\[@([^\]]+)\]/g))
        if (!knownSources.has(match[1]))
            issues.push(`Unresolved source: ${match[1]}`);
    return [...new Set(issues)];
}
export function exportCase(doc: AnalysisDocument): string { return JSON.stringify(parseCase(doc), null, 2) + "\n"; }
