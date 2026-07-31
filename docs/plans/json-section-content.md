# Plan: JSON-native section content contract

## Status

Implemented on 2026-07-31.

## Background

`05f476a89` (2026-07-21, serializable build snapshots) introduced a hard
requirement: site section content must be a JSON document
(`jsonObjectSchema.parse` in
`plugins/site-builder/src/lib/prepare-site-build.ts`). But the requirement is
enforced only at runtime, at the end of the build pipeline, by dropping the
section with a warning diagnostic. Template schemas still speak TypeScript,
where `baseUrl: z.string().optional()` means "maybe `undefined`" — a concept
JSON cannot represent.

The two type systems disagreeing surfaces as silently empty pages: the blog
and agent-discovery datasources return `baseUrl: query.baseUrl`, which
materializes an explicitly-`undefined` property whenever the section query
sets no `baseUrl` (no first-party site sets one). The template schema accepts
it; the JSON gate rejects it; the section is dropped. Verified live on
0.2.0-alpha.240/241: the rizom.ai `writing/essays` (`blog:post-list`) and
`network/directory` (`agent-discovery:agent-list`) sections render empty on
every build.

Note `baseUrl` here is the list page's pagination base _path_ (default
`"/posts"` in `blog-list.tsx`), not the site domain — the sections die over a
value nobody needed.

## Goal

Make the JSON contract structural: a template or section schema whose output
is not JSON-serializable must fail to typecheck, not drop sections at build
time. `exactOptionalPropertyTypes` is already on repo-wide, so a
`z.ZodType`-bound of JSON-object output catches `string | undefined`
properties at compile time.

Absence is modeled in JSON's own vocabulary: `.optional()` in section content
schemas becomes `.nullable().default(null)` (stored content with omitted keys
still parses; output is JSON-representable). Components move destructuring
defaults (fire on `undefined`, not `null`) to `?? fallback` expressions.

## Non-goals

- No central strip of `undefined` keys before the JSON gate — that hides the
  contract violation instead of surfacing it.
- No change to generation/extraction templates (no `layout:`); they never
  pass through the build snapshot.
- No change to how the site domain / absolute URLs are configured.

## Constraint choke points

1. `shell/templates` — `Template.schema` is `z.any()` today
   (`src/types.ts:169`, `src/render-types.ts:58`). Layout-bearing templates
   get a JSON-object output bound.
2. `packages/site-sections` — `defineSection<S extends z.ZodType>` gets the
   same bound. Published Apache-2.0 contract surface: this is a breaking
   change for external site authors → site-lane major changeset.
3. Shared datasource base — `buildListResult` carries an explicit result type
   guarded as a JSON object, which catches `baseUrl: query.baseUrl` and nested
   non-JSON values at the source.

## Migration surface (what the compiler will flag)

- 9 datasources: blog, agent-discovery, doc, social-media, topics, link,
  portfolio, decks, newsletter.
- Layout-bearing schemas across agent-discovery, professional/personal/Rizom
  sites, portfolio, series, products, doc, blog, topics, links, decks,
  social-media, newsletter, and shared section definitions.
- Components consuming migrated fields: props change `| undefined` → `| null`;
  destructuring defaults become `??` or optional UI props are omitted at the
  presentation boundary.
- URL-enriched entities use two explicit phases: pre-enrichment schemas allow
  `null`, while render props require deterministic `url`/label fields.

## Risk to verify early

`@brains/site-composition` derives CMS field metadata and markdown formatters
from section schemas by introspection. optional→nullable must not change what
the CMS renders or how stored markdown round-trips. Verify in phase 1 with
the blog schemas before the wide migration.

## Phases

Constraint lands last so every phase typechecks and ships independently.

1. [x] **Blog + agent-discovery** — migrate schemas, datasource list results,
       and components; verify CMS/formatter round-trip and nullable pre-enrichment
       URL fields.
2. [x] **Remaining entity packages** — doc, social-media, topics, link,
       portfolio, decks, series, products, and newsletter.
3. [x] **Site packages** — professional, personal, and Rizom AI sections.
4. [x] **Flip the bounds** — constrain rendered templates, view registries,
       datasource list results, and `defineSection`; retain snapshot validation as
       the final assertion; add the site-lane breaking changeset.

## Implementation outcome

- Shared recursive JSON types and compile-time output guards now reject
  primitives, functions, top-level optionals, and nested `undefined`.
- Generation-only templates remain unconstrained; only templates with layouts
  must emit JSON objects.
- Legacy field-DSL optionals and Zod view schemas normalize omitted values to
  `null`.
- Site-builder no longer uses a late standalone JSON gate to discover schema
  mistakes; typed schema output is validated again when the prepared snapshot
  is created.
- Blog, agent, and portfolio datasource tests cover absent `baseUrl` and
  pre-enrichment URLs, including JSON round-tripping.
- A running Rover Rizom AI app rebuilt preview output successfully. The
  generated `essays/index.html` and `network/index.html` contain their list
  layouts, and the build emitted no `invalid-section-content` diagnostics.

## Validation

- [x] `bun run typecheck`
- [x] `bun run test`
- [x] `bun run lint`
- [x] `bun run format:check`
- [x] `bun run docs:check`
- [x] `bun run deps:check`
- [x] `bun run workspace:check`
- [x] `bun run env-schema:check`
- [x] `bun run arch:check` (existing orphan warnings only)
- [x] `bun run changeset:check`
- [x] `bunx changeset status`
- [x] Running-app preview rebuild via
      `brain --remote http://localhost:8080 build-site preview`
