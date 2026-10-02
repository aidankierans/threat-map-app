import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { stringify } from 'yaml';
import { ROOT, layerDirs } from '../build/config.js';
import { SCHEMAS, type LayerName } from '../build/schema.js';
import { deriveGraph } from '../build/derive.js';
import { validate } from '../build/validate.js';
import type { BuildResult } from '../build/run.js';
import type { LoadedDoc } from '../build/load.js';
import { sha256, applyFrontmatterPatch } from './fileio.js';
import { exportCase, parseCase } from '../app/case-codec.js';
export function localPath(root: string, name: string): string {
    const path = resolve(root, name), base = realpathSync(root);
    if (!path.startsWith(resolve(root) + sep))
        throw Error('Path must stay inside the dataset.');
    let ancestor = path;
    while (!existsSync(ancestor))
        ancestor = dirname(ancestor);
    const actual = realpathSync(ancestor);
    if (actual !== base && !actual.startsWith(base + sep))
        throw Error('Symlinks must stay inside the dataset.');
    return path;
}
export function atomicWrite(path: string, text: string) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
        writeFileSync(temp, text, { flag: 'wx' });
        renameSync(temp, path);
    }
    finally {
        if (existsSync(temp))
            unlinkSync(temp);
    }
}
export function saveLocalCase(root: string, input: unknown, draft = false) {
    const doc = parseCase(input), text = exportCase(doc);
    if (!draft) {
        const dir = localPath(root, 'case-studies');
        for (const file of existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : []) {
            let existing;
            try {
                existing = parseCase(readFileSync(localPath(root, `case-studies/${file}`), 'utf8'));
            }
            catch {
                continue;
            }
            if (existing.identity.revisionId !== doc.identity.revisionId)
                continue;
            if (exportCase(existing) !== text)
                throw Error('A different case already uses this revision ID. Save a new revision.');
            return { source: `case-studies/${file}`, document: doc };
        }
    }
    const key = draft ? doc.identity.analysisId : doc.identity.revisionId;
    const filename = `${key.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60)}-${sha256(key).slice(0, 10)}.json`;
    const source = `${draft ? '.editor-drafts/cases' : 'case-studies'}/${filename}`;
    const path = localPath(root, source);
    if (!draft && existsSync(path) && readFileSync(path, 'utf8') !== text)
        throw Error('A different case already uses this revision ID. Save a new revision.');
    atomicWrite(path, text);
    return { source, document: doc };
}
const creation = z.strictObject({ meta: z.record(z.string(), z.unknown()), body: z.string().max(64000), group: z.string().optional() });
const groupLayers: Record<string, string> = { 'condition-group': 'condition', 'act-class': 'failure-mode', consequence: 'event' };
export function planCreation(input: unknown, current: BuildResult): Array<{
    source: string;
    text: string;
}> {
    const request = creation.parse(input), layer = request.meta.layer as LayerName;
    if (!Object.hasOwn(SCHEMAS, layer) || !layerDirs[layer] || ['edge', 'page'].includes(layer))
        throw Error('Choose a supported node or group type.');
    const meta = SCHEMAS[layer].strict().parse(request.meta) as Record<string, any>;
    if (current.docs.some(d => d.meta.id === meta.id))
        throw Error('That ID already exists. Choose a different ID.');
    const source = relative(ROOT, localPath(ROOT, `${layerDirs[layer]}/${meta.id}.md`));
    const changes = new Map<string, LoadedDoc>();
    changes.set(meta.id, { meta, body: request.body, source });
    const memberLayer = groupLayers[layer];
    if (memberLayer) {
        // A node belongs to one display group. Moving it must leave every group valid.
        for (const doc of current.docs.filter(d => d.meta.layer === layer && d.meta.members.some((id: string) => meta.members.includes(id)))) {
            const next = { ...doc.meta, members: doc.meta.members.filter((id: string) => !meta.members.includes(id)) };
            SCHEMAS[layer].parse(next);
            changes.set(next.id, { ...doc, meta: next });
        }
    }
    else if (Object.values(groupLayers).includes(layer)) {
        const group = current.docs.find(d => d.meta.id === request.group && groupLayers[d.meta.layer] === layer);
        if (!group)
            throw Error('Choose a group for this node.');
        changes.set(group.meta.id, { ...group, meta: { ...group.meta, members: [...group.meta.members, meta.id] } });
    }
    const docs = [...current.docs.map(d => changes.get(d.meta.id) ?? d), changes.get(meta.id)!];
    const errors = validate(docs, deriveGraph(docs), current.references, { whole: true }).errors;
    if (errors.length)
        throw Error(errors.join('\n'));
    return [...changes.values()].map(doc => ({ source: doc.source, text: doc.meta.id === meta.id ? `---\n${stringify(doc.meta)}---\n\n${doc.body}\n` : applyFrontmatterPatch(readFileSync(localPath(ROOT, doc.source), 'utf8'), { set: { members: doc.meta.members } }, {}) }));
}
export function applyCreation(root: string, changes: Array<{
    source: string;
    text: string;
}>) {
    const files = changes.map(c => ({ path: localPath(root, c.source), text: c.text }));
    const before = files.map(f => existsSync(f.path) ? readFileSync(f.path, 'utf8') : null);
    if (before[0] !== null)
        throw Error('That node file already exists. Reload the map before creating another.');
    const written: number[] = [];
    try {
        files.forEach((f, i) => { atomicWrite(f.path, f.text); written.push(i); });
    }
    catch (error) {
        for (const i of written.reverse()) {
            if (before[i] === null)
                unlinkSync(files[i].path);
            else
                atomicWrite(files[i].path, before[i]!);
        }
        throw error;
    }
    return changes.map(c => c.source);
}
