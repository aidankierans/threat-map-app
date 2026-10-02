import profile from "@threat-map/data/profile.json";
import type { GraphIndex, IndexNode } from "../types.js";
interface Family {
    id: string;
    label: string;
    layer: "affordance" | "condition";
    members: readonly string[];
}
export const DISPLAY_FAMILIES = profile.displayFamilies as readonly Family[];
export interface DisplayGroup {
    id: string;
    label: string;
    lead: string;
    members: string[];
    children?: Array<{
        id: string;
        label: string;
    }>;
    displayOnly: true;
}
const familyByMember = new Map(DISPLAY_FAMILIES.flatMap(family => family.members.map(member => [member, family] as const)));
export function affordanceFamily(id: string): string | undefined {
    const family = familyByMember.get(id);
    return family?.layer === "affordance" ? family.id : undefined;
}
export function conditionFamily(group: string | undefined): string | undefined {
    const family = group && familyByMember.get(group);
    return family && family.layer === "condition" ? family.id : undefined;
}
export function displayFamilyOf(node: IndexNode): string | undefined {
    return node.layer === "condition" ? conditionFamily(node.group) : node.layer === "affordance" ? affordanceFamily(node.id) : undefined;
}
export function displayGroupOf(index: GraphIndex, id: string): DisplayGroup | undefined {
    const family = DISPLAY_FAMILIES.find(entry => entry.id === id);
    if (!family)
        return undefined;
    const nodes = new Set(index.nodes.map(node => node.id));
    const children = family.layer === "condition" ? family.members.flatMap(key => {
        const group = index.groups.find(entry => entry.id === key);
        return group ? [{ id: group.id, label: group.short ?? group.label }] : [];
    }) : undefined;
    const members = family.layer === "condition"
        ? index.groups.filter(group => family.members.includes(group.id)).flatMap(group => group.members)
        : [...family.members];
    return { id, label: family.label, displayOnly: true, children,
        lead: family.layer === "condition" ? "A display family of condition groups. Open a group to inspect its conditions and the distinctions between them." : "A display family of capabilities and access. Open an affordance to inspect the prerequisites and claims it supports.",
        members: [...new Set(members)].filter(member => nodes.has(member)),
    };
}
export function displayBandOrder(index: GraphIndex): string[] {
    const conditionChildren = new Set(DISPLAY_FAMILIES.filter(f => f.layer === "condition").flatMap(f => [...f.members]));
    const actOrder = profile.bandOrder;
    return [
        ...(index.taxonomies.phase?.order ?? []),
        ...index.groups.filter(group => !conditionChildren.has(group.id) && !actOrder.includes(group.id)).map(group => group.id),
        ...actOrder,
        ...DISPLAY_FAMILIES.flatMap(family => [family.id, ...(family.layer === "condition" ? family.members : [])]),
    ];
}
