/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from './App.js';
import { resetHosting } from './hosting.js';
import { WALKTHROUGH_STORAGE_KEY } from './walkthrough-state.js';
let root: HTMLDivElement;
afterEach(()=>{if(root){act(()=>render(null,root));root.remove();}vi.unstubAllGlobals();localStorage.clear();});
it('opens the incident case locally without requesting hosting services',async()=>{
 resetHosting();window.location.hash='';localStorage.clear();
 localStorage.setItem(WALKTHROUGH_STORAGE_KEY,JSON.stringify({dismissed:true,completed:false}));
 const requests:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   requests.push(String(url));
   if(String(url).endsWith('data/case-data.json'))return Response.json(JSON.parse(readFileSync('public/data/case-data.json','utf8')));
   if(String(url).endsWith('data/prose.json'))return Response.json(JSON.parse(readFileSync('public/data/prose.json','utf8')));
   return new Response(null,{status:404});
 }));
 root=document.createElement('div');document.body.append(root);
 await act(async()=>render(<App/>,root));
 await vi.waitFor(()=>expect(root.querySelector('[data-walkthrough="case-example-collective-intrusion"]')).toBeTruthy());
 await act(async()=>{(root.querySelector('[data-walkthrough="case-example-collective-intrusion"]') as HTMLButtonElement).click();});
 await vi.waitFor(()=>expect(root.querySelector('.case-workspace')).toBeTruthy());
 expect(root.textContent).not.toContain('Shared map revisions could not be loaded');
 await vi.waitFor(()=>expect(root.textContent).toContain('Export file'));
 expect(requests.every(url=>url.includes('data/')||url.includes('__editor/token'))).toBe(true);
});
