/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from './App.js';
import { configureHosting, hosting, resetHosting } from './hosting.js';
import { LOCAL_MAP_KEY } from './local-map-key.js';
import { WALKTHROUGH_STORAGE_KEY } from './walkthrough-state.js';
let root: HTMLDivElement;
afterEach(() => { if (root) { act(() => render(null, root)); root.remove(); } vi.unstubAllGlobals(); localStorage.clear(); resetHosting(); });
const button = (label: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const type = (element: Element | null, value: string) => { const input = element as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
async function mount() {
    root = document.createElement('div');
    document.body.append(root);
    await act(async () => render(<App/>, root));
}
it('adds a node through the map editor, keeps it in this browser only, and renders hostile text as text', async () => {
    resetHosting();
    configureHosting({ ...hosting(), capabilities: { ...hosting().capabilities, localMap: true } });
    window.location.hash = '';
    localStorage.clear();
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify({ dismissed: true, completed: false }));
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url: String(url), method: init?.method ?? 'GET' });
        for (const file of ['case-data.json', 'prose.json', 'map-source.json'])
            if (String(url).endsWith(`data/${file}`))
                return Response.json(JSON.parse(readFileSync(`public/data/${file}`, 'utf8')));
        return new Response(null, { status: 404 });
    }));
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    await mount();
    expect(localStorage.getItem(LOCAL_MAP_KEY)).toBeNull();
    await act(async () => button('Edit map')!.click());
    await vi.waitFor(() => expect(button('Add node')).toBeTruthy());
    expect(root.textContent).toContain('saved only in this browser');
    await act(async () => button('Add node')!.click());
    const form = root.querySelector('.local-dataset-panel form')!;
    await vi.waitFor(() => expect(form.querySelector('option[value="stage"]')).toBeTruthy());
    await act(async () => { const select = form.querySelector('select')!; select.value = 'stage'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const hostile = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    await act(async () => type(form.querySelector('label:nth-of-type(2) input'), hostile));
    await act(async () => type(form.querySelector('input[pattern]'), 'S-local-test'));
    await act(async () => type(form.querySelector('textarea'), `${hostile} [a](javascript:alert(1))`));
    await act(async () => { const phase = [...form.querySelectorAll('select')].find(s => s.querySelector('option[value="E"]'))!; phase.value = 'E'; phase.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await vi.waitFor(() => expect(root.textContent).toContain('to your local map'));
    expect(JSON.parse(localStorage.getItem(LOCAL_MAP_KEY)!).docs.some((d: { meta: { id: string } }) => d.meta.id === 'S-local-test')).toBe(true);
    expect(document.querySelector('img, script, a[href^="javascript"]')).toBeNull();
    // Map edits are never sent anywhere: the only requests are the site's own data files.
    expect(requests.every(r => r.method === 'GET' && r.url.includes('data/'))).toBe(true);
    act(() => render(null, root));
    root.remove();
    // Reopen on the new node's details, where its description is inserted as HTML.
    window.location.hash = '#/node/S-local-test';
    await mount();
    await vi.waitFor(() => expect(root.textContent).toContain('This map includes your local edits'));
    await vi.waitFor(() => expect(root.querySelector('.panel, aside')?.textContent).toContain(hostile));
    expect(document.querySelector('img, script, iframe, a[href^="javascript"], [onerror]')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
});
