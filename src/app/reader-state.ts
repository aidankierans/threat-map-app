import type { RouteState } from "./router.js";
export interface Actor {
    id: string;
    label: string;
    kind: "ai" | "human" | "population";
}
export type OccurrenceRef = {
    story: string;
    occurrence: string;
};
export interface Presentation {
    steps: PresentationStep[];
}
export interface PresentationStep {
    id: string;
    kind: "moment" | "caption";
    title: string;
    caption: string;
    narrative?: string;
    occurrences: OccurrenceRef[];
    actors: Array<{
        actor: string;
        at: OccurrenceRef;
    }>;
    introduces: string[];
    contractions: StoryContraction[];
    origin: "derived" | "authored";
    acknowledgedOutOfOrder?: true;
}
export interface RequirementRef {
    target: string;
    all: string[];
    partial: boolean;
    note: string;
}
export type MapClaimRef = {
    kind: "node";
    id: string;
} | {
    kind: "edge";
    from: string;
    to: string;
} | {
    kind: "requirement";
    requirement: RequirementRef;
};
export interface MapBasis {
    revision: string;
    rulesVersion: number;
    dependencies: Array<{
        key: string;
        digest: string;
        label: string;
    }>;
}
export interface ReaderSource {
    label: string;
    reference: {
        kind: "citation";
        key: string;
    } | {
        kind: "url";
        url: string;
    } | {
        kind: "text";
        text: string;
    };
}
export interface ReaderBasis {
    note: string;
    sources: ReaderSource[];
}
export interface StoryOccurrence {
    presentation?: {
        label?: string;
        subtitle?: string;
        status?: string;
        bucket?: string;
        needsCitation?: boolean;
        assumption?: string;
    };
    id: string;
    node: string;
    scope: string;
    argument: {
        kind: "premise";
    } | {
        kind: "requirement";
        ref: RequirementRef;
        members: Array<{
            declared: string;
            occurrence: string;
        }>;
    };
}
export interface AnalysisStory {
    id: string;
    title: string;
    occurrences: StoryOccurrence[];
    destinationOccurrence: string;
    waypointOccurrences: string[];
}
export type JudgmentTarget = {
    kind: "occurrence";
    story: string;
    occurrence: string;
} | {
    kind: "transition";
    story: string;
    occurrence: string;
};
export interface ReaderJudgment extends ReaderBasis {
    id: string;
    target: JudgmentTarget;
    value: "supported" | "assumed" | "uncertain" | "absent" | "disputed" | "disputed-assumption";
}
export interface DeploymentContext {
    title: string;
    description: string;
    scopes: Array<{
        id: string;
        actor: string;
        system: string;
        moment: string;
    }>;
    facts: Array<{
        id: string;
        scope: string;
        kind: "component" | "permission" | "stage" | "condition";
        label: string;
        description: string;
    }>;
    mappings: Array<ReaderBasis & {
        id: string;
        target: JudgmentTarget;
        facts: string[];
        relation: "match" | "difference" | "unknown";
        effect: "applies" | "blocks" | "unresolved";
    }>;
}
export interface StoryContraction {
    story: string;
    through: string;
}
export interface ArchivedStory {
    story: AnalysisStory;
    map: MapBasis;
    context: DeploymentContext;
    judgments: ReaderJudgment[];
    contractions: StoryContraction[];
}
export interface AnalysisContent {
    actors: Actor[];
    presentation: Presentation;
    title: string;
    premise: string;
    interpretation: string;
    context: DeploymentContext;
    view: RouteState;
    request: {
        waypoints: string[];
        destinations: string[];
        mode: "all" | "any";
    };
    stories: AnalysisStory[];
    archivedStories: ArchivedStory[];
    judgments: ReaderJudgment[];
    contractions: StoryContraction[];
}
export interface RevisionRef {
    analysisId: string;
    revisionId: string;
}
export interface AnalysisDocument {
    kind: "threat-map/analysis";
    schemaVersion: 1;
    identity: RevisionRef;
    parent?: RevisionRef;
    createdAt: string;
    map: MapBasis;
    content: AnalysisContent;
}
export interface ReaderState {
    baseline: AnalysisDocument | null;
    savePolicy: "new" | "fork" | "continue";
    draft: {
        map: MapBasis;
        content: AnalysisContent;
    };
    undo: Array<{
        map: MapBasis;
        content: AnalysisContent;
    }>;
    redo: Array<{
        map: MapBasis;
        content: AnalysisContent;
    }>;
    ui: {
        activeStory: string | null;
        activeOccurrence: string | null;
        expandedContractions: string[];
    };
}
export interface Assessment {
    support: "supported" | "conditional" | "unresolved" | "blocked";
    applicability: "applies" | "unresolved" | "blocked";
    scenario: "supported" | "conditional" | "unresolved" | "blocked";
    reasons: Array<{
        kind: "judgment" | "context" | "prerequisite" | "partial" | "unreviewed" | "conflict" | "map-change";
        ref: string;
        message: string;
    }>;
}
