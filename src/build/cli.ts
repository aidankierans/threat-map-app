import { runBuild } from "./run.js";
const validateOnly = process.argv.includes("--validate-only");
const quiet = process.argv.includes("--quiet");
const { index, errors, warnings } = runBuild({ write: !validateOnly });
if (warnings.length && !quiet) {
    console.warn(`\n${warnings.length} warning${warnings.length === 1 ? "" : "s"}:`);
    for (const w of warnings.slice(0, 15))
        console.warn(`  ! ${w}`);
    if (warnings.length > 15)
        console.warn(`  … and ${warnings.length - 15} more`);
}
if (errors.length) {
    console.error(`\n${errors.length} error${errors.length === 1 ? "" : "s"}:`);
    for (const e of errors)
        console.error(`  ✗ ${e}`);
    console.error("\nBuild failed.");
    process.exit(1);
}
if (!quiet) {
    const s = index.stats;
    console.log(`\n${validateOnly ? "Validated" : "Built"}: ` +
        `${s.nodes} nodes · ${s.edges} edges · ${index.questions.length} questions · ` +
        `${index.components.length} components · ${s.references} references · ` +
        `${index.presets.length} shipped view${index.presets.length === 1 ? "" : "s"}`);
    console.log(`Status: ${s.byStatus.verified} verified · ${s.byStatus.reviewed} reviewed · ${s.byStatus.draft} draft`);
}
