import type { JSX } from "preact";
import type { Edge, IndexNode } from "../types.js";
import type { EditableProse } from "./ProseBody.js";
export interface DevTools {
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
