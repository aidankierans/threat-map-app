import type { JSX } from "preact";
import type { Edge, IndexNode } from "../types.js";
import type { EditableProse } from "./ProseBody.js";
import type { AnalysisDocument } from './reader-state.js';
export interface DevTools {
    localCases?: { save:(doc:AnalysisDocument)=>Promise<string>; draft:(doc:AnalysisDocument)=>Promise<string> };
    DatasetTools?: (props:{onOpen:(doc:AnalysisDocument)=>void})=>JSX.Element;
    prose: EditableProse;
    RelationAdder: (props: {
        node: IndexNode;
    }) => JSX.Element;
    EdgeRemover: (props: {
        edge: Edge;
        id: string;
        documented: boolean;
    }) => JSX.Element;
    QuestionLinker: (props: {
        node: IndexNode;
    }) => JSX.Element;
}
