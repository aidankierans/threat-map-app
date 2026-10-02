export interface ScaleBand {
    kind: string;
    members: readonly string[];
}
export function scaleSatisfiers(bands: Iterable<ScaleBand>): (member: string) => readonly string[] {
    const satisfiers = new Map<string, readonly string[]>();
    for (const band of bands) {
        if (band.kind !== "scale")
            continue;
        band.members.forEach((id, i) => {
            if (i === 0)
                return;
            satisfiers.set(id, band.members.slice(i));
        });
    }
    const only = new Map<string, readonly string[]>();
    return (member: string) => {
        const found = satisfiers.get(member);
        if (found)
            return found;
        let self = only.get(member);
        if (!self) {
            self = [member];
            only.set(member, self);
        }
        return self;
    };
}
