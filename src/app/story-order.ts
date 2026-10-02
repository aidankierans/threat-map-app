import type { Story, StoryStep } from "./story.js";
export function orderedActs(story: Story): StoryStep[] {
    const acts = story.steps.filter(s => s.layer === "failure-mode");
    const by = new Map<string, string>();
    for (const s of story.steps.filter(s => s.layer === "condition")) {
        const act = s.because.find(l => story.byId.get(l.from)?.layer === "failure-mode");
        if (act)
            by.set(s.id, act.from);
    }
    const at = new Map(acts.map(a => [a.id, a]));
    const out: StoryStep[] = [];
    const placed = new Set<string>();
    const visit = (a: StoryStep, guard: Set<string>) => {
        if (placed.has(a.id) || guard.has(a.id))
            return;
        guard.add(a.id);
        for (const l of a.because) {
            const id = by.get(l.from);
            if (id && id !== a.id && at.has(id))
                visit(at.get(id)!, guard);
        }
        guard.delete(a.id);
        placed.add(a.id);
        out.push(a);
    };
    for (const a of acts)
        visit(a, new Set());
    return out;
}
export function deployments(story: Story): Array<{
    stage: string;
    components: string[];
    picked: boolean;
}> {
    const rows = new Map<string, {
        stage: string;
        components: string[];
        picked: boolean;
    }>();
    const open = (s: StoryStep) => { const row = rows.get(s.id) ?? { stage: s.id, components: [], picked: s.picked }; rows.set(s.id, row); return row; };
    for (const s of story.steps) {
        const members = s.because.map(l => story.byId.get(l.from)).filter((x): x is StoryStep => !!x);
        for (const stage of members.filter(m => m.layer === "stage")) {
            const row = open(stage);
            for (const c of members.filter(m => m.layer === "component"))
                if (!row.components.includes(c.id))
                    row.components.push(c.id);
        }
    }
    for (const s of story.steps.filter(s => s.layer === "stage"))
        open(s);
    const order = new Map(story.steps.map((s, i) => [s.id, i]));
    return [...rows.values()].sort((a, b) => order.get(a.stage)! - order.get(b.stage)!);
}
