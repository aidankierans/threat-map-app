import { afterEach, expect, it, vi } from 'vitest';
import { configureHosting, resetHosting, serviceRequest } from './hosting.js';
import { fetchSharedCase } from './case-api.js';
afterEach(() => { resetHosting(); vi.unstubAllGlobals(); });
it('boots local catalogs without contacting a server and refuses remote writes', async () => {
 const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
 const map=await (await serviceRequest('map')).json();
 const content=await (await serviceRequest('content')).json();
 expect(map).toMatchObject({editable:false,mode:'local'});
 expect(content).toMatchObject({editable:false,revisions:[]});
 await expect(serviceRequest('map',{body:{action:'publish'}})).rejects.toThrow('hosting adapter');
 await expect(serviceRequest('cases',{body:{}})).rejects.toThrow('hosting adapter');
 expect(fetch).not.toHaveBeenCalled();
});
it('forwards cancellation to a host and preserves service errors', async () => {
 const controller=new AbortController();
 const request=vi.fn(async()=>Response.json({error:'Access denied'},{status:403}));
 configureHosting({request,editorLoginUrl:()=>'/sign-in',capabilities:{sharing:true,feedback:false,history:false}});
 await expect(fetchSharedCase('a'.repeat(64),controller.signal)).rejects.toThrow('Access denied');
 expect(request).toHaveBeenCalledWith('cases',{path:`/${'a'.repeat(64)}`,signal:controller.signal});
});
