import type { DevTools } from "../../app/devtools.js";
import type { GraphIndex } from "../../types.js";
import { BodyEditor } from "./BodyEditor.js";
import { EdgeRemover, QuestionLinker, RelationAdder } from "./RelationTools.js";
import type { EditorContext, EditorRequest } from "./api.js";
export { serverRequest } from "./api.js";
import "./editor.css";
import { DatasetTools, localRequest } from './DatasetTools.js';
export function create({ request, index, local = false }: {
    request: EditorRequest;
    index: GraphIndex;
    local?: boolean;
}): DevTools {
    const ctx: EditorContext = { request, index, local, registry: new Set() };
    window.addEventListener("keydown", (e) => {
        if (e.key !== "e" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
            return;
        const t = e.target;
        if (t instanceof HTMLElement &&
            (t.tagName === "INPUT" ||
                t.tagName === "TEXTAREA" ||
                t.tagName === "SELECT" ||
                t.isContentEditable)) {
            return;
        }
        if (ctx.registry.size === 1) {
            e.preventDefault();
            for (const open of ctx.registry)
                open();
        }
    });
    return {
        ...(local ? {} : { localCases: {
            save:async (doc:Parameters<NonNullable<DevTools['localCases']>['save']>[0])=>(await localRequest(ctx,'case',doc)).source,
            draft:async (doc:Parameters<NonNullable<DevTools['localCases']>['draft']>[0])=>(await localRequest(ctx,'case-draft',doc)).source,
        } }),
        setIndex: (next) => { ctx.index = next; ctx.completions = undefined; },
        DatasetTools:props=><DatasetTools {...props} ctx={ctx}/>,
        prose: (site) => <BodyEditor site={site} ctx={ctx}/>,
        RelationAdder: (props) => <RelationAdder {...props} ctx={ctx}/>,
        EdgeRemover: (props) => <EdgeRemover {...props} ctx={ctx}/>,
        QuestionLinker: (props) => <QuestionLinker {...props} ctx={ctx}/>,
    };
}
