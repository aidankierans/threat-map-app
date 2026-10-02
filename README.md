# Threat map application

An interactive threat map with prerequisite logic, editable Markdown nodes,
case-study authoring, timeline playback, saved views, and JSON import/export.
The included dataset is a standalone example of the reported Hugging Face
incident. Its claims retain their original draft status and citations.

## Run locally

Use Node 24. Run `npm ci`, then `npm run dev`. No hosting account, database,
credentials, or remote service is required. The local editor writes Markdown
and case-study JSON on your machine, with recovery files on disk and a browser
backup. Saved map views are stored in your browser.
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
they are linked, not relicensed. See [release status](RELEASE-STATUS.md): this
repository remains private pending ownership/licensing confirmation.

## Share a case without the original site

Open a case and choose **Export with map data / HTML / PDF**. Review the
included nodes, sources and full contents, then choose:

- **JSON with map data:** the editable case plus its node descriptions, selected
  prerequisites, supporting groups and citations. Recipients use **Case studies
  → Import case study** in application version 0.1.1 or newer. The snapshot
  supplies its own map data without changing the recipient's main dataset.
- **Interactive HTML:** a single file opened directly in a browser, including
  step selection, highlighted claims, node descriptions, sources and a button
  to download the editable JSON. No server, installation or connection is needed.
- **PDF:** a landscape overview on the first page, followed by portrait pages
  containing the steps, full node descriptions, context and bibliography.

All three include the case's notes and retained archived stories. Review them
before distributing the file. Unrelated map nodes and unselected alternative
prerequisites are excluded, but descriptions may discuss broader material.
External bibliography links require a connection when followed. HTML uses
embedded JavaScript for its controls; PDF is the static alternative.

The original **Export file** remains a compact export for recipients who already
have the same dataset. Site share links keep their existing access requirements.
Portable files are independently readable copies: site access changes cannot
revoke a copy you have sent. Imported case files have a 1 MiB size limit.

## Edit and share a local dataset

With `npm run dev`, **Save revision** writes an ordinary JSON file into
`case-studies/`. Each revision gets its own file, preserving earlier revisions.
Case edits also autosave to `.editor-drafts/cases/` on disk after a short delay;
**Recover local case draft** opens those files even in another browser.
Browser storage remains an additional recovery copy. Recovery files are ignored
by Git; saved dataset revisions are not. Portable cases retain their embedded
map when saved in the dataset and work without the original node files.

On the map, **Add node** creates a Markdown file in the configured content
folder. Choose its type, ID, description, prerequisites and display group.
**Add group** creates a group and moves selected members into it. Existing
groups must retain enough members to remain valid; add a new node to an
existing group first if needed. Group semantics distinguish related items,
mutually exclusive alternatives and ordered scales. Open node/group details
and use the local editor to update their text and metadata afterward.

To share a complete dataset, include `content/`, `config/`, `references/`,
`case-studies/` and any `filters/` with a compatible application checkout.
Review all files before sharing. Generated `src/generated/` and `public/data/`
are rebuilt by `npm run dev` or `npm run build`. Run `npm run check` to validate.
These file-writing tools are available only on the loopback development server;
a built static site continues to use browser storage and explicit downloads.
