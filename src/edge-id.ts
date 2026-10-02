export const EDGE_ID_SEP = "~";
export function edgeId(from: string, to: string): string {
    return `${from}${EDGE_ID_SEP}${to}`;
}
export function isEdgeId(id: string): boolean {
    return id.includes(EDGE_ID_SEP);
}
export function parseEdgeId(id: string): {
    from: string;
    to: string;
} | null {
    const parts = id.split(EDGE_ID_SEP);
    if (parts.length !== 2)
        return null;
    const [from, to] = parts;
    if (!from || !to)
        return null;
    return { from, to };
}
