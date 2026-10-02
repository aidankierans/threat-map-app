# Dataset format

Each Markdown document has YAML frontmatter. `config/layers.yaml` maps layer
IDs to content directories, display labels, and allowed prerequisite types.
`src/build/schema.ts` defines the supported document fields. Validation reports
unknown fields, invalid groups, dangling node references, and missing citations.

Use `[[node-id]]` for links and `[@citation-key]` for bibliography citations.
References are BibTeX entries in `references/references.bib`. Gates use
`enabled_by: [{all: [id1, id2]}]`: AND within a group, OR between groups.
A `partial: true` group requires a note and does not establish sufficiency.
Groups must cover conditions, failure modes and events without duplicate membership.

Run `npm run validate` for authoring feedback. Run `npm run content` to generate
reader indexes and prose. Generated artifacts are ignored by Git and must never
be copied between datasets. Changing column labels does not change stable IDs
or prerequisite logic. Configuration changes require restarting the dev server.
`config/application.json` also controls `displayFamilies` and `bandOrder`;
these are presentation choices and do not change the prerequisite rules.

The included `demo-manifest.json` lists the incident nodes selected for the
demo. Only the story's chosen prerequisite groups are included; it does not
represent a complete catalog of possible threats. The case's map fingerprints
refer to this standalone dataset, not another application.
