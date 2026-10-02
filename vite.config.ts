import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { editorPlugin } from "./src/dev/editor-plugin.ts";
export default defineConfig({ plugins: [preact(), editorPlugin()], base: "./",
  resolve: { alias: { "@threat-map/data": resolve("src/generated") }, dedupe: ["preact"] },
  test: { maxWorkers: 4 },
  build: { manifest: true, target: "es2022", assetsInlineLimit: 0, reportCompressedSize: true }
});
