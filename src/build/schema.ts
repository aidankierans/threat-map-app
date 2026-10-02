import { z } from "zod";
export const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*$/;
export const NodeId = z
    .string()
    .regex(NODE_ID_PATTERN, "id must look like S-example, AF-example, FM-example, Q-example");
export const EvidenceBucket = z.enum(["eval", "private", "assessment", "hard"]);
export const Context = z.enum(["internal", "external", "boundary"]);
export const Phase = z.enum(["A", "B", "C", "D", "E", "F", "X"]);
export const Status = z.enum(["draft", "reviewed", "verified"]);
export const Provenance = z.enum(["ai-drafted", "human-written", "human-verified"]);
export const GroupKind = z.enum(["partition", "scale", "classifying"]);
const Epistemic = z.object({
    status: Status.default("draft"),
    provenance: Provenance.default("ai-drafted"),
    needs_citation: z.boolean().default(false),
});
const Common = z
    .object({
    id: NodeId,
    label: z.string().min(1),
    tag: z.string().optional(),
    cites: z.array(z.string()).default([]),
})
    .merge(Epistemic);
const RequirementGroup = z.object({
    all: z.array(NodeId).min(1),
    note: z.string().optional(),
    partial: z.boolean().optional(),
});
const bucketNote = z.string().optional();
export const StageSchema = Common.extend({
    layer: z.literal("stage"),
    phase: Phase,
    order: z.number().int().optional(),
    context: Context.default("internal"),
    evidence_bucket: EvidenceBucket,
    bucket_note: bucketNote,
    enabled_by: z.array(RequirementGroup).default([]),
});
export const AffordanceSchema = Common.extend({
    layer: z.literal("affordance"),
    evidence_bucket: EvidenceBucket,
    bucket_note: bucketNote,
    enabled_by: z.array(RequirementGroup).min(1),
});
export const FailureModeSchema = Common.extend({
    layer: z.literal("failure-mode"),
    evidence_bucket: EvidenceBucket,
    bucket_note: bucketNote,
    enabled_by: z.array(RequirementGroup).min(1),
});
export const ConditionSchema = Common.extend({
    layer: z.literal("condition"),
    evidence_bucket: EvidenceBucket.optional(),
    bucket_note: bucketNote,
    enabled_by: z.array(RequirementGroup).min(1),
});
export const ConditionGroupSchema = Common.extend({
    layer: z.literal("condition-group"),
    kind: GroupKind,
    subject: z.string().min(1),
    short: z.string().optional(),
    members: z.array(NodeId).min(2),
    order: z.number().int().optional(),
});
export const EventSchema = Common.extend({
    layer: z.literal("event"),
    enabled_by: z.array(RequirementGroup).min(1),
    evidence_bucket: EvidenceBucket,
    bucket_note: bucketNote,
});
export const ConsequenceSchema = Common.extend({
    layer: z.literal("consequence"),
    kind: GroupKind,
    short: z.string().optional(),
    members: z.array(NodeId).min(1),
    order: z.number().int().optional(),
});
export const ActClassSchema = Common.extend({
    layer: z.literal("act-class"),
    kind: GroupKind,
    short: z.string().optional(),
    members: z.array(NodeId).min(1),
    order: z.number().int().optional(),
});
export const QuestionSchema = Common.extend({
    layer: z.literal("question"),
    order: z.number().int().optional(),
    addresses: z.array(NodeId).default([]),
    evidence_bucket: EvidenceBucket.optional(),
    bucket_note: bucketNote,
});
export const ComponentSchema = Common.extend({
    layer: z.literal("component"),
    parent: NodeId.optional(),
    order: z.number().int().optional(),
});
export const PageWidgetName = z.enum(["feedback-form"]);
export const PageSchema = Common.extend({
    layer: z.literal("page"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    nav_label: z.string().optional(),
    order: z.number().int().optional(),
    widget: PageWidgetName.optional(),
});
export const EdgeDocSchema = z
    .object({
    layer: z.literal("edge"),
    from: NodeId,
    to: NodeId,
    label: z.string().optional(),
    cites: z.array(z.string()).default([]),
})
    .merge(Epistemic);
export const SCHEMAS = {
    stage: StageSchema,
    affordance: AffordanceSchema,
    "failure-mode": FailureModeSchema,
    condition: ConditionSchema,
    "condition-group": ConditionGroupSchema,
    event: EventSchema,
    consequence: ConsequenceSchema,
    "act-class": ActClassSchema,
    question: QuestionSchema,
    component: ComponentSchema,
    page: PageSchema,
    edge: EdgeDocSchema,
} as const;
export type LayerName = keyof typeof SCHEMAS;
export type Condition = z.infer<typeof ConditionSchema>;
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Affordance = z.infer<typeof AffordanceSchema>;
export type FailureMode = z.infer<typeof FailureModeSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Consequence = z.infer<typeof ConsequenceSchema>;
export type ActClass = z.infer<typeof ActClassSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type Page = z.infer<typeof PageSchema>;
export type EdgeDoc = z.infer<typeof EdgeDocSchema>;
export type AnyNode = Stage | Affordance | FailureMode | Condition | ConditionGroup | Event | Consequence | ActClass | Question | Component | Page;
