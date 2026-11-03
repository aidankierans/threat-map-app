import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../build/run.js';
import { applyCreation, localPath, planCreation, saveLocalCase } from './local-data.js';
import { parseCase } from '../app/case-codec.js';
const roots: string[] = [];
const temporary = () => { const path = mkdtempSync(join(tmpdir(), 'threat-map-local-')); roots.push(path); return path; };
afterEach(() => { for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true }); });
const corpus = runBuild({ write: false });
const meta = { id: 'FM-local-example', label: 'Local example', layer: 'failure-mode', evidence_bucket: 'assessment', enabled_by: [{ all: ['AF-packages'], partial: true, note: 'Additional conditions are required.' }], provenance: 'human-written' };
it('plans node creation together with its group membership and writes both files', () => {
    const group = corpus.index.groups.find(g => g.layer === 'act-class')!;
    const changes = planCreation({ meta, body: 'A local description.', group: group.id }, corpus);
    expect(changes).toHaveLength(2);
    const root = temporary();
    applyCreation(root, changes);
    expect(readFileSync(join(root, changes[0].source), 'utf8')).toContain('A local description.');
    expect(readFileSync(join(root, changes[1].source), 'utf8')).toContain('FM-local-example');
    expect(() => applyCreation(root, changes)).toThrow('already exists');
});
it('creates a group by moving selected members while retaining valid old groups', () => {
    const changes = planCreation({ meta: { id: 'AC-local-example', layer: 'act-class', label: 'Local group', kind: 'classifying', members: ['FM-networkpivot'] }, body: 'A new grouping.' }, corpus);
    expect(changes).toHaveLength(2);
    expect(changes[0].text).toContain('FM-networkpivot');
    expect(changes[1].text).not.toContain('  - FM-networkpivot');
});
it('rejects dangling nodes, invalid groups, duplicate IDs and path traversal before writing', () => {
    expect(() => planCreation({ meta: { ...meta, id: corpus.index.nodes[0].id }, body: '' }, corpus)).toThrow('already exists');
    expect(() => planCreation({ meta: { ...meta, enabled_by: [{ all: ['AF-missing'] }] }, body: '', group: 'AC-incident' }, corpus)).toThrow();
    expect(() => planCreation({ meta: { id: 'CG-invalid', layer: 'condition-group', label: 'Invalid', kind: 'classifying', subject: 'Question', members: ['FM-networkpivot'] }, body: '' }, corpus)).toThrow();
    const root = temporary(), other = temporary();
    mkdirSync(join(root, 'content'));
    symlinkSync(other, join(root, 'content', 'linked'));
    expect(() => localPath(root, '../escape')).toThrow();
    expect(() => localPath(root, 'content/linked/escape.md')).toThrow();
});
it('writes recoverable drafts and immutable dataset revisions as normal JSON files', () => {
    const root = temporary(), doc = structuredClone(corpus.index.caseStudies![0]);
    const draft = saveLocalCase(root, doc, true);
    expect(draft.source.startsWith('.editor-drafts/cases/')).toBe(true);
    doc.content.title = 'Edited on disk';
    saveLocalCase(root, doc, true);
    expect(parseCase(readFileSync(join(root, draft.source), 'utf8')).content.title).toBe('Edited on disk');
    const saved = saveLocalCase(root, doc);
    expect(saved.source.startsWith('case-studies/')).toBe(true);
    expect(parseCase(readFileSync(join(root, saved.source), 'utf8')).content.title).toBe('Edited on disk');
    expect(saveLocalCase(root, doc).source).toBe(saved.source);
    doc.content.title = 'Conflicting revision';
    expect(() => saveLocalCase(root, doc)).toThrow('revision ID');
});
it('does not duplicate an unchanged bundled revision under a second filename', () => {
    const root = temporary(), doc = corpus.index.caseStudies![0];
    mkdirSync(join(root, 'case-studies'));
    writeFileSync(join(root, 'case-studies', 'example.json'), JSON.stringify(doc));
    expect(saveLocalCase(root, doc).source).toBe('case-studies/example.json');
});
