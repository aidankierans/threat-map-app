import { useEffect, useState } from "preact/hooks";
import type { GraphIndex, ProseBundle, Reference } from "../types.js";
import { statusLabel } from "./selectors.js";
export interface HoverContent {
    kicker: string;
    title: string;
    body?: string;
    members?: Array<{
        id: string;
        label: string;
        hidden: boolean;
    }>;
    memberClaim?: string;
    flags?: string;
    meta?: string;
    metaAlign?: "end";
    href?: string;
}
export function HoverCard({ content, x, y, via, }: {
    content: HoverContent | null;
    x: number;
    y: number;
    via?: "press";
}) {
    if (!content)
        return null;
    const press = via === "press";
    const MARGIN = press ? 28 : 14;
    const CARD_W = 340;
    const flipX = x + CARD_W + MARGIN * 2 > window.innerWidth;
    const flipY = press ? y - 180 > 0 : y + 180 > window.innerHeight;
    return (<div class="hovercard" style={{
            left: flipX ? undefined : x + MARGIN,
            right: flipX ? window.innerWidth - x + MARGIN : undefined,
            top: flipY ? undefined : y + MARGIN,
            bottom: flipY ? window.innerHeight - y + MARGIN : undefined,
        }}>
      <div class="hc-kicker">
        <span>{content.kicker}</span>
        
        {content.flags && <span class="hc-flags">{content.flags}</span>}
      </div>
      <div class="hc-title">{content.title}</div>
      {content.body && <div>{content.body}</div>}
      {content.members && (<>
          {content.memberClaim && <p>{content.memberClaim}</p>}
          <ul>
            {content.members.slice(0, 3).map((member) => (<li key={member.id}>
                {member.label}{member.hidden && " (hidden by filters)"}
              </li>))}
          </ul>
          {content.members.length > 3 && <p class="hc-more">{content.members.length - 3} more. Open the group for the complete list.</p>}
        </>)}
      {content.meta && (<div class={`hc-meta${content.metaAlign === "end" ? " end" : ""}`}>{content.meta}</div>)}
    </div>);
}
const PRESS_MS = 420;
const SLOP_PX = 10;
export function useProseHover(index: GraphIndex, prose: ProseBundle | null): {
    content: HoverContent | null;
    x: number;
    y: number;
    via?: "press";
} {
    const [state, setState] = useState<{
        content: HoverContent | null;
        x: number;
        y: number;
        via?: "press";
    }>({ content: null, x: 0, y: 0 });
    useEffect(() => {
        const nodeById = new Map(index.nodes.map((n) => [n.id, n]));
        const contentAt = (el: HTMLElement): HoverContent | null => {
            const xrefId = el.getAttribute("data-xref");
            if (xrefId) {
                const node = nodeById.get(xrefId);
                if (node) {
                    const layer = index.layers.find((l) => l.name === node.layer);
                    return {
                        kicker: `${node.id} · ${layer?.label ?? node.layer}`,
                        title: node.label,
                        body: node.lead,
                        flags: statusLabel(node),
                    };
                }
            }
            const citeKey = el.getAttribute("data-cite");
            if (citeKey && prose) {
                const ref: Reference | undefined = prose.references[citeKey];
                if (ref) {
                    return {
                        kicker: "Source",
                        title: ref.title,
                        body: [ref.authors, ref.venue].filter(Boolean).join(" · ") || undefined,
                        meta: [ref.year, ref.urldate ? `accessed ${ref.urldate}` : null, ref.url]
                            .filter(Boolean)
                            .join(" · "),
                    };
                }
            }
            return null;
        };
        const refAt = (t: EventTarget | null) => ((t as HTMLElement | null)?.closest?.("[data-xref],[data-cite]") ?? null) as HTMLElement | null;
        const hide = () => setState((s) => (s.content ? { ...s, content: null, via: undefined } : s));
        const onOver = (e: MouseEvent) => {
            const el = refAt(e.target);
            if (!el)
                return;
            const content = contentAt(el);
            if (content)
                setState({ content, x: e.clientX, y: e.clientY });
        };
        const onOut = (e: MouseEvent) => {
            if (refAt(e.target))
                hide();
        };
        let press: {
            id: number;
            x: number;
            y: number;
        } | null = null;
        let timer: number | null = null;
        let swallow = false;
        const stop = () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            press = null;
        };
        const onDown = (e: PointerEvent) => {
            swallow = false;
            if (e.pointerType === "mouse")
                return;
            stop();
            hide();
            const el = refAt(e.target);
            if (!el)
                return;
            const content = contentAt(el);
            if (!content)
                return;
            const { clientX: x, clientY: y } = e;
            press = { id: e.pointerId, x, y };
            timer = window.setTimeout(() => {
                timer = null;
                press = null;
                swallow = true;
                setState({ content, x, y, via: "press" });
            }, PRESS_MS);
        };
        const onMove = (e: PointerEvent) => {
            if (!press || press.id !== e.pointerId)
                return;
            if (Math.abs(e.clientX - press.x) > SLOP_PX || Math.abs(e.clientY - press.y) > SLOP_PX)
                stop();
        };
        const onUp = (e: PointerEvent) => {
            if (press && press.id === e.pointerId)
                stop();
        };
        const onClick = (e: MouseEvent) => {
            if (!swallow)
                return;
            swallow = false;
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener("mouseover", onOver);
        document.addEventListener("mouseout", onOut);
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
        document.addEventListener("pointercancel", onUp, true);
        document.addEventListener("click", onClick, true);
        return () => {
            stop();
            document.removeEventListener("mouseover", onOver);
            document.removeEventListener("mouseout", onOut);
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("pointermove", onMove, true);
            document.removeEventListener("pointerup", onUp, true);
            document.removeEventListener("pointercancel", onUp, true);
            document.removeEventListener("click", onClick, true);
        };
    }, [index, prose]);
    return state;
}
