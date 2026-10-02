export interface GuideBox {
    left: number;
    top: number;
    width: number;
    height: number;
}
export function guideArrow(card: GuideBox, target: GuideBox, gap = 6) {
    const cx = card.left + card.width / 2, cy = card.top + card.height / 2;
    const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
    const dx = tx - cx, dy = ty - cy, length = Math.hypot(dx, dy);
    if (!length)
        return null;
    const cardRatio = Math.min(dx ? card.width / (2 * Math.abs(dx)) : Infinity, dy ? card.height / (2 * Math.abs(dy)) : Infinity);
    const targetRatio = Math.min(dx ? (target.width / 2 + gap) / Math.abs(dx) : Infinity, dy ? (target.height / 2 + gap) / Math.abs(dy) : Infinity);
    if ((1 - cardRatio - targetRatio) * length <= 2)
        return null;
    return {
        x1: cx + dx * cardRatio, y1: cy + dy * cardRatio,
        x2: tx - dx * targetRatio,
        y2: ty - dy * targetRatio,
    };
}
