/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { bundleCase, portableIndex, portableProse } from './portable-map.js';
import { parseCase, exportCase, caseReview } from './case-codec.js';
import { exportInteractiveHtml } from './case-publication.js';
import { createCasePdf } from './case-pdf.js';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { CaseWorkspace } from './CaseWorkspace.js';
import { openCase, caseReducer, draftDocument } from './case-edit.js';
import { autosaveCase, loadCaseDraft, saveCase } from './case-store.js';
import type { GraphIndex, ProseBundle } from '../types.js';
const index: GraphIndex = JSON.parse(readFileSync('src/generated/graph-index.json', 'utf8'));
const prose: ProseBundle = JSON.parse(readFileSync('public/data/prose.json', 'utf8'));
const original = parseCase(JSON.parse(readFileSync('public/data/case-data.json', 'utf8')).caseStudies.find((d: {
    identity: {
        analysisId: string;
    };
}) => d.identity.analysisId === 'collective-intrusion'), index);
const portable = () => bundleCase(original, index, prose);
it('retains the snapshot through editing, undo, autosave and revision saving', () => {
    const doc = portable();
    let state = openCase(doc);
    state = caseReducer(state, { type: 'text', step: doc.content.presentation.steps[0].id, title: 'Edited title' })!;
    state = caseReducer(state, { type: 'undo' })!;
    expect(draftDocument(state).embeddedMap).toEqual(doc.embeddedMap);
    expect(autosaveCase(state)).toBe(true);
    const restored = loadCaseDraft()!;
    expect(saveCase(restored).document.embeddedMap).toEqual(doc.embeddedMap);
    localStorage.clear();
});
it('renders an imported snapshot when the host has no matching nodes', async () => {
    const doc = portable(), root = document.createElement('div');
    document.body.append(root);
    const host = { ...index, nodes: [], gates: {}, edges: [] };
    try {
        await act(async () => render(h(CaseWorkspace, { index: host, prose: { docs: {}, references: {} }, reader: openCase(doc), dispatch: () => { }, step: 0, onStep: () => { }, onLeave: () => { }, saved: true }), root));
        expect(root.textContent).toContain('using the included map data');
        expect(root.querySelectorAll('#graph-canvas .node').length).toBeGreaterThan(0);
    }
    finally {
        act(() => render(null, root));
        root.remove();
    }
});
it('imports all case nodes and citations independently of the recipient map', () => {
    const doc = portable();
    const recipient = { ...index, nodes: [], gates: {}, edges: [], mapBasis: { ...original.map, dependencies: [] } };
    const imported = parseCase(exportCase(doc), recipient);
    expect(imported.embeddedMap!.nodes).toHaveLength(14);
    const own = portableIndex(imported.embeddedMap!, imported.map);
    expect(caseReview(imported, own)).toEqual([]);
    expect(Object.keys(portableProse(imported.embeddedMap!, own).docs)).toContain('FM-networkpivot');
    expect(bundleCase(imported, recipient, { docs: {}, references: {} })).toEqual(imported);
    expect(doc.identity.revisionId).not.toBe(original.identity.revisionId);
    expect(original.embeddedMap).toBeUndefined();
});
it('omits unrelated nodes, alternative requirements and file paths', () => {
    const augmented = structuredClone(index);
    augmented.nodes.push({ ...index.nodes[0], id: 'PRIVATE-UNRELATED', label: 'Private unrelated node' });
    augmented.gates['FM-networkpivot'].push({ all: ['PRIVATE-UNRELATED'], note: 'Private alternative' });
    const text = exportCase(bundleCase(original, augmented, prose));
    expect(text).not.toContain('PRIVATE-UNRELATED');
    expect(text).not.toContain('Private alternative');
    expect(JSON.parse(text).embeddedMap.nodes.every((n: {
        source: string;
    }) => n.source === '')).toBe(true);
});
it('rejects missing prerequisites, missing references and executable reference URLs', () => {
    const missing = portable();
    missing.embeddedMap!.nodes = missing.embeddedMap!.nodes.filter(n => n.id !== 'FM-networkpivot');
    expect(() => parseCase(missing)).toThrow();
    const citations = portable();
    citations.embeddedMap!.references = {};
    expect(() => parseCase(citations)).toThrow();
    const unsafe = portable();
    Object.values(unsafe.embeddedMap!.references)[0].url = 'javascript:alert(1)';
    expect(() => parseCase(unsafe)).toThrow();
});
it('escapes active content in the standalone HTML and embeds a reusable case', () => {
    const doc = portable();
    doc.content.title = '</script><img src=x onerror=alert(1)>';
    const html = exportInteractiveHtml(doc);
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.querySelector('img')).toBeNull();
    expect(page.querySelectorAll('script')).toHaveLength(2);
    expect(page.querySelector('script[src], link[rel=stylesheet]')).toBeNull();
    expect(parseCase(page.querySelector('#case-data')!.textContent!).content.title).toBe(doc.content.title);
    expect(page.querySelectorAll('[data-node]')).toHaveLength(14);
    expect(page.querySelectorAll('[data-step-panel]')).toHaveLength(10);
});
it('produces a PDF with overview, steps, descriptions and bibliography', async () => {
    const doc = portable();
    const pdf = await createCasePdf(doc);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(27);
    expect(pdf.output().startsWith('%PDF')).toBe(true);
    // Optional local visual review artifacts contain only the approved public incident.
    if (process.env.EXPORT_REVIEW_DIR) {
        mkdirSync(process.env.EXPORT_REVIEW_DIR, { recursive: true });
        writeFileSync(`${process.env.EXPORT_REVIEW_DIR}/case.pdf`, new Uint8Array(pdf.output('arraybuffer')));
        writeFileSync(`${process.env.EXPORT_REVIEW_DIR}/case.html`, exportInteractiveHtml(doc));
    }
});
