/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from './App.js';
import { configureHosting, hosting, resetHosting } from './hosting.js';
import { WALKTHROUGH_STORAGE_KEY } from './walkthrough-state.js';
let root: HTMLDivElement;
beforeEach(() => {
    resetHosting();
    configureHosting({ ...hosting(), capabilities: { ...hosting().capabilities, localMap: true } });
    window.location.hash = '';
    localStorage.clear();
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify({ dismissed: true, completed: false }));
    // jsdom has no layout; the tutorial only points at controls that have a box.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 20, top: 60, width: 80, height: 44, right: 100, bottom: 104, x: 20, y: 60, toJSON() { } }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        for (const file of ['case-data.json', 'prose.json', 'map-source.json'])
            if (String(url).endsWith(`data/${file}`))
                return Response.json(JSON.parse(readFileSync(`public/data/${file}`, 'utf8')));
        return new Response(null, { status: 404 });
    }));
});
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); resetHosting(); });
const card = () => root.querySelector('.walkthrough-card')!;
const title = () => card().querySelector('h2')!.textContent;
const cardButton = (label: string) => [...card().querySelectorAll('button')].find(b => b.textContent === label)!;
const target = (name: string) => root.querySelector<HTMLElement>(`[data-walkthrough="${name}"]`)!;
const click = async (element: Element) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const enter = async (element: Element) => act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
/** Waits for the step and for its control to be highlighted, which is when the tutorial starts listening for it. */
async function reach(heading: string) {
    await vi.waitFor(() => {
        expect(title()).toBe(heading);
        expect(card().textContent).not.toContain('Preparing the map');
        expect(root.querySelector('.walkthrough-target')).toBeTruthy();
    }, { timeout: 4000 });
}
it('undoes each step when going back, including leaving the map for the case study', async () => {
    root = document.createElement('div');
    document.body.append(root);
    await act(async () => render(<App/>, root));
    await click([...root.querySelectorAll('header button')].find(b => b.textContent === 'Tutorial')!);
    await vi.waitFor(() => expect(root.querySelector('.walkthrough-card')).toBeTruthy());
    await click(cardButton('Start guided example'));
    await reach('Open the case-study menu');
    const menu = () => root.querySelector<HTMLDetailsElement>('details.case-menu');
    await click(target('case-menu'));
    await reach('Choose the introductory example');
    expect(menu()?.open).toBe(true);
    // Back closes the menu again, so opening it is still the next action.
    await click(cardButton('Back'));
    await reach('Open the case-study menu');
    await vi.waitFor(() => expect(menu()?.open).toBe(false));
    await click(target('case-menu'));
    await reach('Choose the introductory example');
    await vi.waitFor(() => expect(target('case-example-collective-intrusion')).toBeTruthy());
    await click(target('case-example-collective-intrusion'));
    await reach('Start with one case study');
    // Back leaves the case for the map with the menu open, where the example can be chosen again.
    await click(cardButton('Back'));
    await reach('Choose the introductory example');
    await vi.waitFor(() => expect(root.querySelector('.case-workspace')).toBeNull());
    await vi.waitFor(() => expect(menu()?.open).toBe(true));
    await click(target('case-example-collective-intrusion'));
    await reach('Start with one case study');
    await click(cardButton('Next'));
    await reach('Move through the steps');
    const stepLabel = () => root.querySelector('[aria-live="polite"]')?.textContent;
    const first = stepLabel();
    await click(target('case-next'));
    await vi.waitFor(() => expect(stepLabel()).not.toBe(first));
    await click(cardButton('Next'));
    await reach('Find the current step on the map');
    // Back returns to the step of the case that was showing when the tutorial reached it.
    await click(cardButton('Back'));
    await reach('Move through the steps');
    await vi.waitFor(() => expect(stepLabel()).toBe(first));
    await click(cardButton('Next'));
    await reach('Find the current step on the map');
    await click(target('case-focus'));
    await reach('Inspect a node on the canvas');
    expect(target('case-focus').getAttribute('aria-pressed')).toBe('true');
    // Back undoes Focus current step, so the required action is available again.
    await click(cardButton('Back'));
    await reach('Find the current step on the map');
    await vi.waitFor(() => expect(target('case-focus').getAttribute('aria-pressed')).toBe('false'));
    await click(target('case-focus'));
    await reach('Inspect a node on the canvas');
    await enter(target('case-node'));
    await reach('Read the details, then return');
    await click(cardButton('Back'));
    await reach('Inspect a node on the canvas');
    await vi.waitFor(() => expect(root.querySelector('.case-node-details')).toBeNull());
    await vi.waitFor(() => expect(target('case-focus').getAttribute('aria-pressed')).toBe('true'));
    await enter(target('case-node'));
    await reach('Read the details, then return');
    await click(target('case-back'));
    await reach('Copy a link to this case');
    await click(cardButton('Next'));
    await reach('Explore the wider map');
    await vi.waitFor(() => expect(root.querySelector('.case-workspace')).toBeNull());
    // Back from the map returns to the case study, not just to its tutorial text.
    await click(cardButton('Back'));
    await reach('Copy a link to this case');
    await vi.waitFor(() => expect(root.querySelector('.case-workspace')).toBeTruthy());
    await click(cardButton('Next'));
    await reach('Explore the wider map');
    await click(cardButton('Next'));
    await reach('Make the map fit your screen');
    await click(cardButton('Next'));
    await reach('Expand a group');
    await vi.waitFor(() => expect(target('map-expand-group')).toBeTruthy());
    await click(target('map-expand-group'));
    await reach('Read a node and its connections');
    await vi.waitFor(() => expect(root.querySelector('[data-walkthrough="map-expand-group"]')).toBeNull());
    // Back collapses the group again, so its expand control returns.
    await click(cardButton('Back'));
    await reach('Expand a group');
    await vi.waitFor(() => expect(target('map-expand-group')).toBeTruthy());
    await click(target('map-expand-group'));
    await reach('Read a node and its connections');
    await click(cardButton('Next'));
    await reach('Find tools for narrowing the map');
    await click(target('map-filters'));
    await reach('Find a topic');
    await click(cardButton('Back'));
    await reach('Find tools for narrowing the map');
    await vi.waitFor(() => expect(target('map-filters').getAttribute('aria-expanded')).toBe('false'));
    await click(target('map-filters'));
    await reach('Find a topic');
    for (const heading of ['Trace a possible path', 'Copy a link to your view', 'Edit your own copy of the map'])
        await click(cardButton('Next')).then(() => reach(heading));
    await click(target('map-edit'));
    await reach('Add nodes and groups');
    await click(cardButton('Back'));
    await reach('Edit your own copy of the map');
    await vi.waitFor(() => expect(target('map-edit').textContent).toBe('Edit map'));
    await click(target('map-edit'));
    await reach('Add nodes and groups');
    await click(cardButton('Next'));
    await reach('Keep or share your edits');
    await vi.waitFor(() => expect(target('local-map-bar')).toBeTruthy());
    await click(cardButton('Finish'));
    await vi.waitFor(() => expect(root.querySelector('.walkthrough-card')).toBeNull());
    expect(target('map-edit').textContent).toBe('Edit map');
});
