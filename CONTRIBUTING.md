# Contributing

This repository is a generated meta-index of MCP server lists, directories, registries, and marketplaces.

Discovery combines focused GitHub searches for awesome lists, directories, registries, and catalogs, then deduplicates repositories before classification. The exact queries are recorded in the generated datasets, one query per line.

## How to Contribute

### Adding an MCP Index Repository

1. Fork this repo
2. Confirm that the project curates multiple MCP servers or ecosystem resources
3. Ensure its GitHub description clearly identifies it as a list, collection, directory, catalog, registry, or marketplace
4. Add or adjust a focused classifier test if the repository is incorrectly excluded
5. Submit a PR describing why the project belongs in this meta-index

Do not edit generated sections or generated Markdown pages directly. Individual MCP servers should be submitted to one of the official or community directories linked from README.md.

### Correcting an Entry

Check `data/discovery-audit.json` for the current decision and reason. Corrections should improve the structured discovery or classification rules rather than patching generated output. Include a regression test demonstrating the incorrect inclusion or exclusion.

### Adding a Registry or Index Link

1. Add to the appropriate table (Official or Community)
2. Keep entries in alphabetical order by platform name

## PR Guidelines

- One addition per PR preferred
- Ensure links are valid and accessible
- Do not commit secrets or edit generated output by hand
- Run `npm run check` from `find-awesome-mcp-servers` before submitting

## Preview the Catalog Locally

From the repository root, stage the same files used by GitHub Pages and serve them:

```sh
preview_dir=$(mktemp -d)
mkdir -p "$preview_dir/data"
cp site/index.html site/app.js site/catalog.mjs site/styles.css "$preview_dir/"
cp data/indexes.json data/index-links.json "$preview_dir/data/"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$preview_dir"
```

Open `http://127.0.0.1:8000`. Search, activity, license, sort, and submitted repository lookups are saved in the URL. The repository lookup checks README links across the full dataset, independent of catalog filters.

The daily update workflow calls the publishing workflow with the commit it just pushed. Pushes to `main` that change the site or datasets also publish the catalog.
