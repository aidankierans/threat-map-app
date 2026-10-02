import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
const HOVER_MS = 300;
const PRESS_MS = 420;
const SLOP_PX = 10;
const GAP_PX = 10;
const EDGE_PX = 8;
const TIP_ID = "tip";
interface Anchor {
    top: number;
    bottom: number;
    left: number;
    right: number;
}
const CARRIER = "[title]:not(option),[data-tip]";
function hintOf(el: HTMLElement): string | null {
    const native = el.getAttribute("title");
    if (native !== null) {
        el.removeAttribute("title");
        if (native.trim())
            el.setAttribute("data-tip", native);
        else
            el.removeAttribute("data-tip");
    }
    const tip = el.getAttribute("data-tip");
    return tip && tip.trim() ? tip : null;
}
export function TipLayer() {
    const [shown, setShown] = useState<{
        text: string;
        anchor: Anchor;
    } | null>(null);
    const [place, setPlace] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | null>(null);
    const targetRef = useRef<HTMLElement | null>(null);
    const pressRef = useRef<{
        id: number;
        x: number;
        y: number;
    } | null>(null);
    const swallowRef = useRef(false);
    useEffect(() => {
        const stopTimer = () => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
        const hide = () => {
            stopTimer();
            pressRef.current = null;
            const el = targetRef.current;
            if (el) {
                if (el.getAttribute("aria-describedby") === TIP_ID)
                    el.removeAttribute("aria-describedby");
                targetRef.current = null;
            }
            setShown(null);
            setPlace(null);
        };
        const show = (el: HTMLElement, text: string) => {
            const r = el.getBoundingClientRect();
            targetRef.current = el;
            if (!el.hasAttribute("aria-describedby"))
                el.setAttribute("aria-describedby", TIP_ID);
            setPlace(null);
            setShown({ text, anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
        };
        const carrierAt = (e: {
            target: EventTarget | null;
            clientX: number;
            clientY: number;
        }) => {
            let el = (e.target as HTMLElement | null)?.closest?.(CARRIER) as HTMLElement | null;
            if (!el) {
                try {
                    el = (document.elementFromPoint(e.clientX, e.clientY)?.closest(CARRIER) ??
                        null) as HTMLElement | null;
                }
                catch {
                    el = null;
                }
            }
            if (!el)
                return null;
            const text = hintOf(el);
            return text ? { el, text } : null;
        };
        const onOver = (e: PointerEvent) => {
            if (e.pointerType !== "mouse")
                return;
            const found = carrierAt(e);
            if (!found) {
                if (targetRef.current || timerRef.current !== null)
                    hide();
                return;
            }
            if (found.el === targetRef.current)
                return;
            hide();
            const { el, text } = found;
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                show(el, text);
            }, HOVER_MS);
        };
        const onOut = (e: PointerEvent) => {
            if (e.pointerType !== "mouse")
                return;
            if (!targetRef.current && timerRef.current === null)
                return;
            const to = e.relatedTarget as Node | null;
            const el = targetRef.current;
            if (el && to && el.contains(to))
                return;
            hide();
        };
        const onDown = (e: PointerEvent) => {
            swallowRef.current = false;
            if (e.pointerType === "mouse") {
                hide();
                return;
            }
            hide();
            const found = carrierAt(e);
            if (!found)
                return;
            const { el, text } = found;
            pressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                pressRef.current = null;
                swallowRef.current = true;
                show(el, text);
            }, PRESS_MS);
        };
        const onMove = (e: PointerEvent) => {
            const p = pressRef.current;
            if (!p || p.id !== e.pointerId)
                return;
            if (Math.abs(e.clientX - p.x) > SLOP_PX || Math.abs(e.clientY - p.y) > SLOP_PX) {
                pressRef.current = null;
                stopTimer();
            }
        };
        const onUp = (e: PointerEvent) => {
            const p = pressRef.current;
            if (p && p.id === e.pointerId) {
                pressRef.current = null;
                stopTimer();
            }
        };
        const onClick = (e: MouseEvent) => {
            if (!swallowRef.current)
                return;
            swallowRef.current = false;
            e.preventDefault();
            e.stopPropagation();
        };
        const onContextMenu = (e: Event) => {
            if (targetRef.current)
                e.preventDefault();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                hide();
        };
        const onFocus = (e: FocusEvent) => {
            const found = carrierAt({ target: e.target, clientX: -1, clientY: -1 });
            if (!found)
                return;
            try {
                if (!found.el.matches(":focus-visible"))
                    return;
            }
            catch {
                return;
            }
            hide();
            show(found.el, found.text);
        };
        document.addEventListener("pointerover", onOver);
        document.addEventListener("pointerout", onOut);
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
        document.addEventListener("pointercancel", onUp, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("contextmenu", onContextMenu);
        document.addEventListener("keydown", onKey);
        document.addEventListener("focusin", onFocus);
        document.addEventListener("focusout", hide);
        window.addEventListener("scroll", hide, true);
        window.addEventListener("resize", hide);
        window.addEventListener("blur", hide);
        return () => {
            stopTimer();
            document.removeEventListener("pointerover", onOver);
            document.removeEventListener("pointerout", onOut);
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("pointermove", onMove, true);
            document.removeEventListener("pointerup", onUp, true);
            document.removeEventListener("pointercancel", onUp, true);
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("contextmenu", onContextMenu);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("focusin", onFocus);
            document.removeEventListener("focusout", hide);
            window.removeEventListener("scroll", hide, true);
            window.removeEventListener("resize", hide);
            window.removeEventListener("blur", hide);
        };
    }, []);
    useLayoutEffect(() => {
        if (!shown)
            return;
        const box = boxRef.current;
        if (!box)
            return;
        const w = box.offsetWidth;
        const h = box.offsetHeight;
        const { top, bottom, left, right } = shown.anchor;
        const roomAbove = top - GAP_PX - h >= EDGE_PX;
        const roomBelow = bottom + GAP_PX + h <= window.innerHeight - EDGE_PX;
        const y = roomAbove || !roomBelow ? Math.max(EDGE_PX, top - GAP_PX - h) : bottom + GAP_PX;
        const centred = (left + right) / 2 - w / 2;
        const x = Math.max(EDGE_PX, Math.min(centred, window.innerWidth - EDGE_PX - w));
        setPlace({ x, y });
    }, [shown]);
    if (!shown)
        return null;
    return (<div id={TIP_ID} role="tooltip" class="tip" ref={boxRef} style={{
            left: place ? place.x : 0,
            top: place ? place.y : 0,
            visibility: place ? "visible" : "hidden",
        }}>
      {shown.text}
    </div>);
}
