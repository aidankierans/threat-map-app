/**
 * Report compressed payload sizes so changes remain visible during validation.
 * Size growth is a review signal, not a deployment blocker. The development
 * editor leak check below remains a hard failure.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { startupAssets } from "./startup-assets.js";

const DIST = resolve(import.meta.dirname, "../dist");

if (!existsSync(DIST)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const gz = (path: string) => gzipSync(readFileSync(path)).length;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// The dev-server editor must be physically absent from the deployed site.
// Its code paths all carry the `__editor` sentinel (endpoint URLs), so a
// single grep over everything shipped keeps the `apply: "serve"` and
// import.meta.env.DEV guards honest over time.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
const leaked = walk(DIST).filter((f) => readFileSync(f).includes("__editor"));
if (leaked.length) {
  console.error("Editor code leaked into dist/:");
  for (const f of leaked) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const assets = readdirSync(join(DIST, "assets"));
const startup = startupAssets(JSON.parse(readFileSync(join(DIST, ".vite/manifest.json"), "utf8")));
const startupJsBytes = startup.js.reduce((sum, file) => sum + gz(join(DIST, file)), 0);
const startupCssBytes = startup.css.reduce((sum, file) => sum + gz(join(DIST, file)), 0);
const jsBytes = assets
  .filter((f) => f.endsWith(".js"))
  .reduce((sum, f) => sum + gz(join(DIST, "assets", f)), 0);
const cssBytes = assets
  .filter((f) => f.endsWith(".css"))
  .reduce((sum, f) => sum + gz(join(DIST, "assets", f)), 0);
const proseBytes = existsSync(join(DIST, "data/prose.json"))
  ? gz(join(DIST, "data/prose.json"))
  : 0;

const rows: Array<[string, number]> = [
  ["JS (map startup, index inlined)", startupJsBytes],
  ["JS (all chunks)", jsBytes],
  ["CSS", cssBytes],
  ["prose.json (deferred)", proseBytes],
  ["case-data.json (deferred)", existsSync(join(DIST, "data/case-data.json")) ? gz(join(DIST, "data/case-data.json")) : 0],
];

console.log("\nGzipped footprint (informational):");
for (const [label, actual] of rows) {
  console.log(`  ${label.padEnd(32)} ${kb(actual).padStart(9)}`);
}
console.log(`\n  Map startup JS + CSS: ${kb(startupJsBytes + startupCssBytes)} (excludes deferred data and feature chunks)`);
console.log(`  Optional JS: ${kb(jsBytes - startupJsBytes)}\n`);
