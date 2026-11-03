/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileManifest, exportManifest, manifestFromSeed, parseManifest, MANIFEST_KIND } from "./local-map.js";
import { LocalMapStore } from "./app/local-map-store.js";
import { LOCAL_MAP_KEY } from "./app/local-map-key.js";
import { renderMarkdown } from "./build/markdown.js";
import { sharedMarkdown } from "./app/shared-markdown.js";
import { bundleCase, portableProse, portableIndex } from "./app/portable-map.js";
import { parseCase } from "./app/case-codec.js";
import { exportInteractiveHtml } from "./app/case-publication.js";
import type { MapSeed } from "./shared-map.js";
import type { GraphIndex } from "./types.js";
const seed: MapSeed = JSON.parse(readFileSync("public/data/map-source.json", "utf8"));
const builtIndex: GraphIndex = JSON.parse(readFileSync("src/generated/graph-index.json", "utf8"));
const original = parseCase(JSON.parse(readFileSync("public/data/case-data.json", "utf8")).caseStudies[0], builtIndex);
const PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)><circle/></svg>",
    "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<details open ontoggle=alert(1)>x</details>",
    "<style>*{background:url(javascript:alert(1))}</style>",
    "<math><mi xlink:href=\"javascript:alert(1)\">x</mi></math>",
    "<!-- --><script>alert(1)</script>",
    "\"><script>alert(1)</script>",
    "[a](javascript:alert(1))",
    "[a](JaVaScRiPt:alert(1))",
    "[a](  javascript:alert(1))",
    "[a](java&#115;cript:alert(1))",
    "[a](data:text/html,<script>alert(1)</script>)",
    "[a](vbscript:msgbox(1))",
    "![a](javascript:alert(1))",
    "![a](https://example.com/x.png \"t\" onerror=alert(1))",
    "[a]: javascript:alert(1)\n\n[link][a]",
    "[a](#/node/\" onclick=\"alert(1))",
    "<https://example.com\" onclick=\"alert(1)>",
    "[[CD-missing\" onmouseover=\"alert(1)|label]]",
    "[@missing\" onmouseover=\"alert(1)]",
    "`<script>alert(1)</script>`\n\n```\n<script>alert(1)</script>\n```",
    "\u0000PH0\u0000 \u0000PH1\u0000",
    "- [ ] <img src=x onerror=alert(1)>",
];
// Links to missing nodes or sources are refused by validation before rendering, so a saved description omits them.
const PAYLOAD = PAYLOADS.filter(p => !p.includes("[[") && !p.includes("[@")).join("\n\n");
const TAGS = new Set(["P", "A", "EM", "STRONG", "CODE", "PRE", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "HR", "BR", "SPAN", "DEL", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "INPUT"]);
const ATTRIBUTES = new Set(["class", "href", "title", "rel", "target", "data-xref", "data-layer", "data-cite", "aria-label", "align", "start", "disabled", "type", "checked"]);
/** Fails unless the HTML could only display text and follow web or in-map links. */
function expectInert(html: string) {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    for (const element of body.querySelectorAll("*")) {
        expect(TAGS, `<${element.tagName.toLowerCase()}> in ${html}`).toContain(element.tagName);
        if (element.tagName === "INPUT")
            expect(element.getAttribute("type")).toBe("checkbox");
        for (const attribute of element.attributes) {
            expect(ATTRIBUTES, `${attribute.name} in ${html}`).toContain(attribute.name);
            if (attribute.name === "href")
                expect(attribute.value).toMatch(/^(https?:\/\/|#\/)/i);
        }
    }
}
function memoryStorage() {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v), removeItem: (k: string) => void values.delete(k), clear: () => values.clear() } });
    return values;
}
const call = async (store: LocalMapStore, method: "GET" | "PUT" | "POST" | "DELETE", path: string, body?: unknown) => {
    const response = await store.request(method, path, body);
    return { status: response.status, data: await response.json() };
};
const condition = seed.docs.find(d => d.meta.layer === "condition")!;
const group = seed.docs.find(d => d.meta.layer === "condition-group" && d.meta.members.includes(condition.meta.id))!;
const newCondition = (overrides: Record<string, unknown> = {}) => ({ meta: { id: "CD-local-test", label: "Local test", layer: "condition", status: "draft", provenance: "human-written", cites: [], needs_citation: false, enabled_by: condition.meta.enabled_by, ...overrides }, body: "A locally added condition.", group: group.meta.id });
afterEach(() => localStorage.clear());
describe("manifest", () => {
    it("reproduces the bundled map exactly, so saved cases stay current", async () => {
        const compiled = await compileManifest(seed, manifestFromSeed(seed));
        expect(compiled.index.mapBasis?.revision).toBe(builtIndex.mapBasis?.revision);
        expect(parseManifest(exportManifest(manifestFromSeed(seed)))).toEqual(manifestFromSeed(seed));
    });
    it.each([
        ["a page", (m: any) => m.docs.push({ meta: { id: "PAGE-x", layer: "page", label: "x", slug: "x", widget: "feedback-form" }, body: "" })],
        ["a question", (m: any) => m.docs.push({ meta: { id: "Q-x", layer: "question", label: "x" }, body: "" })],
        ["an unknown field", (m: any) => { m.docs[0].meta.widget = "feedback-form"; }],
        ["an invalid ID", (m: any) => { m.docs[0].meta.id = "__proto__"; }],
        ["a duplicate ID", (m: any) => m.docs.push(structuredClone(m.docs[0]))],
        ["a javascript: source", (m: any) => { m.references.x = { key: "x", title: "x", url: "javascript:alert(1)" }; }],
        ["a data: source", (m: any) => { m.references.x = { key: "x", title: "x", url: "data:text/html,x" }; }],
        ["a prototype source key", (m: any) => { m.references = JSON.parse("{\"__proto__\":{\"key\":\"__proto__\",\"title\":\"x\",\"url\":\"\"}}"); }],
        ["a mismatched source key", (m: any) => { m.references.x = { key: "y", title: "x", url: "" }; }],
        ["an extra top-level field", (m: any) => { m.config = {}; }],
        ["an oversized description", (m: any) => { m.docs[0].body = "x".repeat(64001); }],
        ["a wrong edge ID", (m: any) => { const edge = m.docs.find((d: any) => d.meta.layer === "edge"); if (edge) edge.meta.id = "S-a~S-b"; else m.docs[0].meta.layer = "edge"; }],
    ])("rejects %s", (_name, mutate) => {
        const manifest = JSON.parse(exportManifest(manifestFromSeed(seed)));
        mutate(manifest);
        expect(() => parseManifest(manifest)).toThrow();
    });
    it("rejects files over the size limit before parsing them", () => {
        expect(() => parseManifest(" ".repeat(1536 * 1024 + 1))).toThrow(/1.5 MiB/);
    });
});
describe("rendering untrusted text", () => {
    it.each(PAYLOADS)("keeps %j inert in every renderer", payload => {
        const references = { ok: { key: "ok", title: "ok", url: "https://example.com" }, bad: { key: "bad", title: "\"><script>alert(1)</script>", url: "javascript:alert(1)" } };
        const ctx = { resolveId: () => ({ id: "CD-x", label: "<b>x</b>", layer: "condition" }), references, source: "test" };
        expectInert(renderMarkdown(`${payload} [@ok] [@bad]`, { ...ctx, safe: true }).html);
        expectInert(sharedMarkdown(`${payload} [@ok] [@bad] [[${condition.meta.id}]]`, builtIndex, references));
    });
    it("never links a citation whose source is not a web address, even for trusted content", () => {
        const html = renderMarkdown("[@bad]", { resolveId: () => undefined, references: { bad: { key: "bad", title: "t", url: "javascript:alert(1)" } }, source: "test" }).html;
        expect(html).not.toContain("javascript:");
    });
});
describe("local map store", () => {
    it("adds a node to the local manifest, keeps it after reopening, and exports it", async () => {
        memoryStorage();
        const store = await LocalMapStore.open(seed);
        expect(store.state.changed).toBe(false);
        const created = await call(store, "POST", "create", newCondition());
        expect(created).toEqual({ status: 200, data: { sources: ["local/CD-local-test"] } });
        expect(store.state.index.nodes.some(n => n.id === "CD-local-test")).toBe(true);
        expect(store.state.index.groups.find(g => g.id === group.meta.id)?.members).toContain("CD-local-test");
        expect(store.state.changed).toBe(true);
        const reopened = await LocalMapStore.open(seed);
        expect(reopened.state.index.nodes.some(n => n.id === "CD-local-test")).toBe(true);
        expect(parseManifest(reopened.export()).docs.some(d => d.meta.id === "CD-local-test")).toBe(true);
    });
    it("edits text and fields, rejects invalid edits as drafts, and detects stale writes", async () => {
        memoryStorage();
        const store = await LocalMapStore.open(seed);
        const doc = (await call(store, "GET", `doc?id=${condition.meta.id}`)).data;
        const saved = await call(store, "PUT", "doc", { id: condition.meta.id, baseHash: doc.hash, body: "Edited.", set: { label: "Edited label" } });
        expect(saved.data).toMatchObject({ outcome: "applied", changed: true });
        expect(store.state.index.nodes.find(n => n.id === condition.meta.id)?.label).toBe("Edited label");
        expect((await call(store, "PUT", "doc", { id: condition.meta.id, baseHash: doc.hash, body: "Stale." })).status).toBe(409);
        const invalid = await call(store, "PUT", "doc", { id: condition.meta.id, baseHash: saved.data.hash, set: { enabled_by: [{ all: ["CD-does-not-exist"] }] } });
        expect(invalid.data.outcome).toBe("drafted");
        expect(store.state.index.nodes.find(n => n.id === condition.meta.id)?.label).toBe("Edited label");
        expect((await call(store, "PUT", "doc", { id: condition.meta.id, baseHash: saved.data.hash, set: { id: "CD-renamed" } })).data.outcome).toBe("drafted");
        expect((await call(store, "PUT", "doc", { id: condition.meta.id, baseHash: saved.data.hash, set: { widget: "feedback-form" } })).data.outcome).toBe("drafted");
    });
    it("refuses node types and fields the manifest does not carry", async () => {
        memoryStorage();
        const store = await LocalMapStore.open(seed);
        expect((await call(store, "POST", "create", { meta: { id: "PAGE-x", layer: "page", label: "x", slug: "x", widget: "feedback-form" }, body: "" })).status).toBe(400);
        expect((await call(store, "POST", "create", newCondition({ onclick: "alert(1)" }))).status).toBe(400);
        expect((await call(store, "POST", "create", newCondition({ id: "CD-local-test\"><script>" }))).status).toBe(400);
        expect((await call(store, "GET", "doc?id=__proto__")).status).toBe(404);
        expect((await call(store, "POST", "case", {})).status).toBe(404);
        expect(store.state.changed).toBe(false);
    });
    it("leaves the map unchanged when an imported file is invalid", async () => {
        const storage = memoryStorage();
        const store = await LocalMapStore.open(seed);
        await call(store, "POST", "create", newCondition());
        const before = storage.get(LOCAL_MAP_KEY);
        const bad = JSON.parse(store.export());
        bad.references.x = { key: "x", title: "x", url: "javascript:alert(1)" };
        await expect(store.replace(JSON.stringify(bad))).rejects.toThrow();
        await expect(store.replace("{\"kind\":\"threat-map/manifest\"")).rejects.toThrow();
        expect(storage.get(LOCAL_MAP_KEY)).toBe(before);
        expect(store.state.index.nodes.some(n => n.id === "CD-local-test")).toBe(true);
    });
    it("shows the original map when stored data has been tampered with", async () => {
        const storage = memoryStorage();
        storage.set(LOCAL_MAP_KEY, JSON.stringify({ kind: MANIFEST_KIND, version: 1, base: "x", docs: [{ meta: { id: "PAGE-x", layer: "page" }, body: "<script>alert(1)</script>" }], references: {} }));
        const store = await LocalMapStore.open(seed);
        expect(store.state.recovered).toMatch(/could not be loaded/);
        expect(store.state.changed).toBe(false);
    });
    it("resets to the bundled map and clears storage", async () => {
        const storage = memoryStorage();
        const store = await LocalMapStore.open(seed);
        await call(store, "POST", "create", newCondition());
        await store.reset();
        expect(storage.has(LOCAL_MAP_KEY)).toBe(false);
        expect(store.state.changed).toBe(false);
    });
});
describe("sharing a case built on local edits", () => {
    it("keeps hostile node text inert in the map, the shared case, and the HTML export", async () => {
        memoryStorage();
        const store = await LocalMapStore.open(seed);
        const used = original.content.stories[0].occurrences[0].node;
        const doc = (await call(store, "GET", `doc?id=${used}`)).data;
        const saved = await call(store, "PUT", "doc", { id: used, baseHash: doc.hash, body: PAYLOAD, set: { label: "<img src=x onerror=alert(1)>" } });
        expect(saved.data.outcome).toBe("applied");
        for (const prose of Object.values(store.state.prose.docs))
            expectInert(prose.html);
        // The server stores only what parseCase accepts; readers render it with portableProse.
        const shared = parseCase(JSON.parse(JSON.stringify(bundleCase(original, store.state.index, store.state.prose))));
        const index = portableIndex(shared.embeddedMap!, shared.map);
        for (const prose of Object.values(portableProse(shared.embeddedMap!, index).docs))
            expectInert(prose.html);
        const page = new DOMParser().parseFromString(exportInteractiveHtml(shared), "text/html");
        expect(page.querySelectorAll("script")).toHaveLength(2);
        expect(page.querySelector("script#case-data")?.getAttribute("type")).toBe("application/json");
        for (const element of page.querySelectorAll("*")) {
            for (const attribute of element.attributes) {
                expect(attribute.name.startsWith("on"), attribute.name).toBe(false);
                if (attribute.name === "href")
                    expect(attribute.value).toMatch(/^(https?:\/\/|#)/i);
            }
        }
        expect(page.querySelectorAll("img, iframe, object, embed")).toHaveLength(0);
    });
    it("rejects a shared case whose embedded map links a source to a script", () => {
        const doc = bundleCase(original, builtIndex, JSON.parse(readFileSync("public/data/prose.json", "utf8")));
        const key = Object.keys(doc.embeddedMap!.references)[0];
        doc.embeddedMap!.references[key].url = "javascript:alert(1)";
        expect(() => parseCase(JSON.parse(JSON.stringify(doc)))).toThrow();
    });
});
