# Threat map application

An interactive threat map with prerequisite logic, editable Markdown nodes,
case-study authoring, timeline playback, saved views, and JSON import/export.
The included dataset is a standalone example of the reported Hugging Face
incident. Its claims retain their original draft status and citations.

## Run locally

Use Node 24. Run `npm ci`, then `npm run dev`. No hosting account, database,
credentials, or remote service is required. The local editor writes Markdown
on your machine; case drafts and saved views are stored in your browser.
Export case files to back them up or share them. `npm run build` creates a
static site in `dist`; `npm run preview` builds and serves that site.

Run `npm run check` before committing. The local editor is restricted to
loopback requests and is excluded from production builds.

## Customize

Edit column labels in `config/layers.yaml` under `layers.<id>.label`.
Keep internal layer IDs stable: they define the modeling semantics.
Edit the title, tutorial case, source link base, and display families in
`config/application.json`. Restart the dev server after configuration edits.
Content lives in `content`, citations in `references`, bundled cases in
`case-studies`, and optional saved views in `filters`.

See [hosting integration](docs/HOSTING.md) for connecting your own services
and [data format](docs/DATA.md) for authoring a dataset.

Code is under MIT. Cited third-party source materials retain their own rights;
they are linked, not relicensed.
