import type { ComponentChildren, JSX } from "preact";
export interface ProseSite {
    id: string;
    html?: string;
    class?: string;
    style?: string | JSX.CSSProperties;
    fallback?: ComponentChildren;
}
export type EditableProse = (site: ProseSite) => JSX.Element;
export function ProseBody(props: ProseSite & {
    editable?: EditableProse;
}) {
    const { editable, ...site } = props;
    if (site.html === undefined)
        return <>{site.fallback ?? null}</>;
    if (editable)
        return editable(site);
    return (<div class={site.class} style={site.style} dangerouslySetInnerHTML={{ __html: site.html }}/>);
}
