import type { Manifest } from "vite";

/** Follow static imports only: dynamic imports belong to optional features. */
export function startupAssets(manifest: Manifest, entry = "index.html") {
  const seen = new Set<string>();
  const js = new Set<string>();
  const css = new Set<string>();
  function visit(key: string) {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing build manifest entry: ${key}`);
    seen.add(key);
    if (chunk.file.endsWith(".js")) js.add(chunk.file);
    for (const file of chunk.css ?? []) css.add(file);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(entry);
  return { js: [...js], css: [...css] };
}
