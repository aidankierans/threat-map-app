# Hosting and application integration

## Static or local operation

Serve `dist/` from any static host. Hash routes work below a subdirectory.
No network backend is assumed. Map browsing, local dev editing, case authoring,
browser persistence, and file import/export work without one. Remote publishing,
shared history, and feedback require a hosting adapter.

If your dataset is confidential, protect every generated asset at the host,
including JavaScript, JSON, and source data. A login screen in the browser is
not access control. Do not put secrets into application configuration.

## Consuming the application

Install a pinned package archive or Git revision. The package ships TypeScript
source for Vite and Node/tsx. Its exports map `@aidankierans/threat-map-app/*`
to `src/*`. In your Vite configuration, alias `@threat-map/data` to your own
`src/generated` directory and deduplicate `preact`. Add the matching TypeScript
paths mapping. Run the exported `build/cli.ts` with your application as the
working directory (or set `THREAT_MAP_ROOT`). Generated outputs are written to
that root, never to the installed dependency. Add `dev/editor-plugin.ts` to
Vite for local editing. Because Node does not strip TypeScript inside
`node_modules`, load the plugin with `tsx/esm/api` in an async Vite config:

```ts
import { tsImport } from "tsx/esm/api";
const { editorPlugin } = await tsImport(
  "@aidankierans/threat-map-app/dev/editor-plugin.ts", import.meta.url);
```

For Vitest, set `test.server.deps.inline` to
`["@aidankierans/threat-map-app"]`. Start the UI by importing `App` from
`app/App.tsx`, configuring the host, and rendering it with Preact. Import
`styles/app.css`, `styles/case.css`, and `styles/shell.css`. Alternatively,
`app/main.tsx` mounts the default local application into `#app`.

## Optional services

Call `configureHosting` from `app/hosting.ts` before mounting the application.
The adapter supplies `request(service, options)`, `editorLoginUrl(next)` and
capabilities (`sharing`, `feedback`, `history`, and optional `localMap`).
Requests return a standard Response, allowing any HTTP client, transport, or
local implementation. The default adapter returns read-only local catalogs
without network calls. `localMap` needs no service: readers edit a copy of the
map in their own browser, built from `data/map-source.json`.

Serve the application with a Content-Security-Policy that disallows inline
script, for example `script-src 'self'` plus the origins of any services you
add. The application uses no inline script, and the policy is a second
safeguard if text from map files or shared cases is ever rendered unescaped.
An adapter selects its own URLs; the application contains no deployment URLs.

`options` contains `path` (query or resource suffix), optional JSON `body`,
`editor` (requested UI mode, never proof of authorization), and optional
`AbortSignal`. A body denotes a write. JSON error responses may contain
`error` and `errors`. Non-success status codes must be preserved.

| Service | Contract |
| --- | --- |
| map | Read catalog, document, history or export; preview/publish `MapWrite`. Types in `shared-map.ts` and client operations in `app/shared-map-api.ts`. |
| content | Read `SharedCatalog` or revision history; write bibliography/research-note revisions. Types in `app/shared-content.ts`; callers in `app/SharedEditor.tsx`. |
| cases | Write a validated `AnalysisDocument`, receive `{id}` (64 lowercase hex characters); read `/<id>` to retrieve an immutable case. |
| feedback | Write `{message,name,contact}`; return a successful status only after durable acceptance. |

For example, a host can map `service` to its own URL, append `options.path`,
send `options.body` as JSON, forward the abort signal, and preserve the Response.
Return capability flags matching the services you actually provide.

Enforce authorization, payload validation, concurrency checks, and access to
history on the server. Never trust the browser's `editor` flag or `editable`
display state. Keep immutable history and make publication atomic if supporting
collaborative editing. Authentication/storage implementations are host-owned.
The portable validators do not replace server authorization.
