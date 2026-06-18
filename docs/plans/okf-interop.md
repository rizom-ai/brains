# OKF interop (Open Knowledge Format export/import)

## Status

Proposed.

## Background

Google Cloud shipped the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) (OKF v0.1, June 2026): a vendor-neutral spec for handing AI agents curated context. An OKF _bundle_ is a directory of markdown files, one concept per file, where the file path is the concept's identity. Each file has YAML frontmatter (`type` required; `title`, `description`, `resource`, `tags`, `timestamp` standard-optional, plus producer-defined extras) and a markdown body that links to other concepts with ordinary markdown links — turning the directory into a knowledge graph. Optional `index.md` (navigation) and `log.md` (change history) per directory.

The spec is deliberately minimal: just markdown, just files, just frontmatter. There is a reference HTML graph visualizer and a Knowledge Catalog ingestion path on the consumer side.

### Concept vs. entity — not the same thing

OKF's unit is a **concept**, not an "entity"; the resemblance to our `entity` is convergent design, not a shared lineage. They are structurally isomorphic (markdown + frontmatter + a `type` + inter-file links) but play different roles:

- **An OKF concept is descriptive metadata _about_ a resource that lives elsewhere.** The concept doc for `orders` describes a BigQuery table — it carries a `resource:` frontmatter field pointing at the real thing, and the body is curated documentation (schema, join paths, metric definitions) so an agent can reason about a system whose actual data sits elsewhere. It's a catalog card: read-mostly, points outward.
- **A brains entity _is_ the content itself.** A `note`'s `content` field is the note; an `image` entity holds the image. It is the canonical store the agent reads _and writes_, and that the site-engine publishes from. Self-contained, with no "real thing" elsewhere.

So OKF is a knowledge/metadata layer _describing_ data; brains is the data. Both happen to have landed on "markdown files with frontmatter as an agent-legible knowledge format" — a genuinely common pattern right now — which is why the export mapping is mechanically clean even though the semantics differ.

The consequence for this plan: our entity types do not all map onto OKF concepts equally well.

- **Catalog-shaped entities** — `link`, `products`, `site-info`, `topics`, `series` — are themselves descriptions/pointers, so they map almost natively onto OKF concepts (`link`'s URL is a natural `resource:`).
- **Content-bearing entities** — `note`, `document`, `image` — _are_ the resource. Exporting them as concepts is valid OKF (it's just markdown) but is a slightly different use than OKF's headline data-catalog case, and there is no `resource:` to point at because the entity is the thing.

This does not block export — OKF is permissive enough to carry both — but it is why Phase 1 leads with a content-bearing type (`note`) to prove the mechanical round-trip, while the catalog-shaped types are where the mapping is semantically natural rather than merely valid.

## Why it applies here

`brains` already stores every entity as markdown with frontmatter and serves it to agents over MCP, so OKF is a near-superset match rather than a new model:

| OKF                                                 | brains                                                  |
| --------------------------------------------------- | ------------------------------------------------------- |
| concept = one markdown file, path = identity        | entity = markdown in `brain-data/`, one file per entity |
| `type` (required)                                   | `entityType` (required in `baseEntitySchema`)           |
| `title`/`description`/`tags`/`timestamp` (optional) | `metadata` + `created`/`updated`                        |
| markdown links → graph                              | `link` entity + site-engine cross-refs                  |
| served to agents                                    | exposed over MCP today                                  |

`baseEntitySchema` (`shell/entity-service/src/types.ts`) carries `id`, `entityType`, `content`, `created`, `updated`, `visibility`, `metadata`, `contentHash` — a strict superset of OKF's standardized surface. The one semantic gap: OKF `type` is a free descriptive string, whereas `entityType` is a controlled, plugin-backed value.

## Non-goals

- Do **not** rearchitect the entity model around OKF. It is strictly less expressive than `baseEntitySchema`; adopting it internally would be a regression.
- No new published `@rizom/*` package. OKF interop is a capability inside the existing sync layer, not a fan-out package (per the site-composition / package-boundary direction).
- Not a replacement for `directory-sync`. OKF is an _interchange_ format for handing content to/from external OKF consumers and producers; `brain-data/` stays the canonical store.

## Proposal

Add OKF as an interchange format alongside the existing `directory-sync` export/import handlers. The cleanest home is `directory-sync` itself (it already owns `directoryExportJobHandler` / `directoryImportJobHandler`, frontmatter generation, and the brain-data filesystem contract), adding an `okf` export/import mode rather than a brand-new plugin — revisit splitting it out only if the surface grows.

### Mapping rules (the contract)

Export (`brains entity → OKF concept file`):

- `entityType` → frontmatter `type`.
- `metadata.title` (or H1 / id fallback) → `title`.
- `created`/`updated` → `timestamp` (use `updated`).
- entity-defined metadata fields → passthrough frontmatter (OKF allows producer extensions).
- `content` body → markdown body; rewrite internal entity references to relative markdown links so the bundle forms a graph.
- Filter `visibility: private` out of exported bundles by default; expose an opt-in flag.
- Emit a directory `index.md` per `entityType` for progressive disclosure.

Import (`OKF concept file → brains entity`):

- frontmatter `type` → `entityType` when a matching adapter is registered; otherwise fall back to `base` (note) and preserve original `type` in metadata.
- Round-trip stable: a brains-exported bundle re-imported must reproduce the same entities (modulo `contentHash`/timestamps).

### Reuse, don't reinvent

- Serialization goes through the existing `EntityAdapter.toMarkdown` / `fromMarkdown` and `generateFrontmatter` / `parseFrontmatter` (`shell/entity-service`); the OKF layer only re-maps frontmatter keys and link syntax on top.
- Entity enumeration uses `EntityService.listEntities` / `getEntity` — no direct DB access.

## Phasing (thin vertical slices)

Each phase is a walking-skeleton-first vertical slice with tests written before implementation.

### Phase 1 — Export skeleton, one entity type

Walking skeleton: export `note` (`base`) entities to an OKF bundle directory.

- Tests first: a `note` with title + body produces one OKF concept file with `type` frontmatter and an `index.md` for the type.
- Implement minimal `okf` export mode reusing `toMarkdown` + frontmatter re-mapping.
- Validate the output bundle against the OKF reference HTML visualizer manually once.

### Phase 2 — Export all registered entity types + visibility filter

- Tests first: multiple entity types each land in their own directory with correct `type`; `visibility: private` excluded unless opt-in flag set.
- Generalize the type→directory mapping; per-type `index.md`.

### Phase 3 — Internal links become bundle graph edges

- Tests first: an entity referencing another (via `link` entity / inline reference) exports as a relative markdown link resolving to the target concept file.
- Implement reference rewriting on export.

### Phase 4 — Import + round-trip

- Tests first: importing a brains-exported bundle reproduces the same entities (round-trip); importing a foreign bundle with an unknown `type` falls back to `base` with `type` preserved in metadata.
- Implement `okf` import mode mapping `type`→`entityType` and parsing concept files.

### Phase 5 — Surface as a job/command

- Tests first: an `okf-export` / `okf-import` job (mirroring `directoryExportJobHandler`) runs end-to-end and reports status through the existing formatter.
- Wire the mode into the directory-sync job/command surface.

## Validation

1. `note` export produces a spec-valid OKF concept file with required `type` frontmatter.
2. Mixed-type export lands each type in its own directory with per-type `index.md`.
3. `visibility: private` entities excluded by default, included with the opt-in flag.
4. Cross-entity reference exports as a working relative markdown link.
5. Round-trip: export → import reproduces the same entities (ignoring `contentHash`/timestamps).
6. Foreign bundle with unknown `type` imports as `base` with original `type` retained in metadata.
7. Exported bundle renders in the OKF reference HTML visualizer.

## Open questions

- Where does the `resource` frontmatter field map from — published site URL, or omit until the site-engine route is known? (Natural for catalog-shaped types like `link`; absent for content-bearing types.)
- Should `log.md` change history be emitted from entity `updated` history, or deferred until there is a consumer that reads it?
