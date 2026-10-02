import type { ComponentChildren } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { TERMS, type TermName } from "./terms.js";
import "../styles/terms.css";
export function Term({ term, children }: {
    term: TermName;
    children?: ComponentChildren;
}) {
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [position, setPosition] = useState({ left: 8, top: 8 });
    const wrapper = useRef<HTMLSpanElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const popup = useRef<HTMLSpanElement>(null);
    const id = useId();
    const value = TERMS[term];
    const close = () => { setOpen(false); setPinned(false); };
    useLayoutEffect(() => {
        if (!open)
            return;
        const positionPopup = () => {
            const anchor = trigger.current?.getBoundingClientRect();
            const box = popup.current?.getBoundingClientRect();
            if (!anchor || !box)
                return;
            const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8));
            const below = anchor.bottom + 8;
            const top = below + box.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - box.height - 8);
            setPosition({ left, top });
        };
        positionPopup();
        window.addEventListener("resize", positionPopup);
        document.addEventListener("scroll", positionPopup, true);
        return () => { window.removeEventListener("resize", positionPopup); document.removeEventListener("scroll", positionPopup, true); };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const outside = (event: PointerEvent) => { if (event.target instanceof Node && !wrapper.current?.contains(event.target))
            close(); };
        const key = (event: KeyboardEvent) => { if (event.key === "Escape") {
            close();
            event.stopPropagation();
        } };
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
    }, [open]);
    return <span ref={wrapper} class="term" onPointerEnter={event => { if (event.pointerType !== "touch")
        setOpen(true); }} onPointerLeave={() => { if (!pinned && document.activeElement !== trigger.current)
        setOpen(false); }}>
    <button ref={trigger} type="button" class="term-trigger" aria-label={`Explain ${value.label.toLowerCase()}`} aria-describedby={open ? id : undefined} aria-expanded={open} onFocus={() => setOpen(true)} onBlur={event => { if (!wrapper.current?.contains(event.relatedTarget as Node | null))
        close(); }} onClick={event => { event.stopPropagation(); if (pinned)
        close();
    else {
        setPinned(true);
        setOpen(true);
    } }}>{children ?? value.label}</button>
    {open && <span ref={popup} id={id} class="term-definition" role="tooltip" style={position}><strong>{value.label}</strong><span>{value.definition}</span></span>}
  </span>;
}
