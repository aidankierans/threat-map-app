export const GATE_ID_SEP = ".";
export function gateId(gatedId: string, group: number): string {
    return `${gatedId}${GATE_ID_SEP}${group}`;
}
export function isGateId(id: string): boolean {
    return id.includes(GATE_ID_SEP);
}
export function parseGateId(id: string): {
    gatedId: string;
    group: number;
} | null {
    const at = id.indexOf(GATE_ID_SEP);
    if (at <= 0)
        return null;
    const gatedId = id.slice(0, at);
    const rest = id.slice(at + 1);
    if (!/^\d+$/.test(rest))
        return null;
    return { gatedId, group: Number(rest) };
}
