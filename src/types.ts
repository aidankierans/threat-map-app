export type LayerName = "component" | "stage" | "affordance" | "failure-mode" | "condition" | "event";
export type EvidenceBucket = "eval" | "private" | "assessment" | "hard";
export type Context = "internal" | "external" | "boundary";
export type Phase = "A" | "B" | "C" | "D" | "E" | "F" | "X";
export type Status = "draft" | "reviewed" | "verified";
export type Provenance = "ai-drafted" | "human-written" | "human-verified";
export type GroupKind = "partition" | "scale" | "classifying";
export type LayerRole = "spine" | "aside";
export interface LayerConfig {
    name: LayerName;
    label: string;
    role: LayerRole;
    hue: string;
}
export interface TaxonomyEntry {
    label: string;
    description?: string;
    short?: string;
    tip?: string;
    marker?: boolean;
}
export interface SubjectTaxonomy {
    values: Record<string, TaxonomyEntry>;
    parties: Record<string, string>;
    overrides: Record<string, string>;
}
export interface Taxonomies {
    evidence_bucket: {
        values: Record<string, TaxonomyEntry>;
    };
    phase: {
        order: Phase[];
        values: Record<string, TaxonomyEntry>;
    };
    context: {
        values: Record<string, TaxonomyEntry>;
    };
    status: {
        order: Status[];
        values: Record<string, TaxonomyEntry>;
    };
    provenance: {
        values: Record<string, TaxonomyEntry>;
    };
    subject?: SubjectTaxonomy;
}
export interface IndexNode {
    id: string;
    layer: LayerName;
    tag: string;
    label: string;
    lead: string;
    bucket?: EvidenceBucket;
    bucketNote?: string;
    phase?: Phase;
    group?: string;
    order?: number;
    context?: Context;
    status: Status;
    provenance: Provenance;
    needsCitation: boolean;
    source: string;
    fold?: FoldInfo;
}
export interface FoldInfo {
    key: string;
    heading: string;
    members: string[];
    summary: string;
}
export interface Edge {
    from: string;
    to: string;
    groups: number[];
}
export interface EdgeDocIndex {
    from: string;
    to: string;
    label?: string;
    lead: string;
    status: Status;
    provenance: Provenance;
    needsCitation: boolean;
    source: string;
}
export interface Group {
    all: string[];
    note?: string;
    partial?: boolean;
}
export type Gate = Group[];
export interface QuestionIndex {
    id: string;
    label: string;
    order: number;
    bucket?: EvidenceBucket;
    bucketNote?: string;
    addresses: string[];
    status: Status;
    provenance: Provenance;
    source: string;
}
export interface GroupIndex {
    id: string;
    layer: string;
    label: string;
    kind: GroupKind;
    subject?: string;
    short?: string;
    lead: string;
    members: string[];
    order: number;
    source: string;
}
export interface ComponentIndex {
    id: string;
    label: string;
    parent?: string;
    mapsTo: string[];
    order: number;
    source: string;
}
export type PageWidget = "feedback-form";
export interface PageIndex {
    id: string;
    slug: string;
    label: string;
    navLabel: string;
    order: number;
    source: string;
    widget?: PageWidget;
}
export const SAVED_FILTER_KIND = "threat-map/saved-filters";
export interface FilterPreset {
    name: string;
    query: string;
    description?: string;
    default?: boolean;
    covers?: string | string[];
    keeps?: string[];
    source: string;
}
export interface GraphIndex {
    mapBasis?: import("./app/reader-state.js").MapBasis;
    sourceKeys?: Record<string, string[]>;
    caseStudies?: import("./app/reader-state.js").AnalysisDocument[];
    generatedAt: string;
    layers: LayerConfig[];
    taxonomies: Taxonomies;
    nodes: IndexNode[];
    edges: Edge[];
    edgeDocs: Record<string, EdgeDocIndex>;
    gates: Record<string, Gate>;
    gateMembers: Record<string, LayerName[]>;
    questions: QuestionIndex[];
    groups: GroupIndex[];
    components: ComponentIndex[];
    pages: PageIndex[];
    presets: FilterPreset[];
    stats: {
        nodes: number;
        edges: number;
        references: number;
        byStatus: Record<Status, number>;
    };
}
export interface Reference {
    key: string;
    title: string;
    url: string;
    authors?: string;
    year?: string;
    venue?: string;
    urldate?: string;
}
export interface ProseDoc {
    markdown?: string;
    html: string;
    cites: string[];
}
export interface ProseBundle {
    docs: Record<string, ProseDoc>;
    references: Record<string, Reference>;
}
