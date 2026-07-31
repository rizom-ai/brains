# Plan: JSON-native section content contract

## Status

Proposed.

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
3. Shared datasource base — `buildListResult` return typed as a JSON object,
   which is what catches `baseUrl: query.baseUrl` at the source.

## Migration surface (what the compiler will flag)

- 9 datasources: blog, agent-discovery, doc, social-media, topics, link,
  portfolio, decks, newsletter.
- ~130–150 `.optional()` fields across layout-bearing schemas:
  agent-discovery 20, sites/professional 26, portfolio 17, sites/personal 16,
  series 8, products 7, doc 5, blog 3, sites/rizom-ai ~14, plus shared
  post/pagination schemas. Topics, link, decks, summary-list, and
  rizom-ecosystem are already clean.
- Components consuming migrated fields: props change `| undefined` → `| null`;
  destructuring defaults become `??`.

## Risk to verify early

`@brains/site-composition` derives CMS field metadata and markdown formatters
from section schemas by introspection. optional→nullable must not change what
the CMS renders or how stored markdown round-trips. Verify in phase 1 with
the blog schemas before the wide migration.

## Phases

Constraint lands last so every phase typechecks and ships independently.

1. **Blog + agent-discovery** — migrate their schemas, datasources, and
   components; verify site-composition CMS/formatter round-trip. This alone
   fixes the live empty-sections bug on rizom.ai. Tests: section content for
   `blog:post-list` / `agent-discovery:agent-list` with no `baseUrl` in the
   query passes the JSON gate and renders with default pagination paths.
2. **Remaining entity packages** — doc, social-media, topics, link,
   portfolio, decks, series, products, newsletter datasource.
3. **Site packages** — sites/professional, sites/personal, sites/rizom-ai
   sections.
4. **Flip the bounds** — type `Template.schema` (shell/templates) and
   `defineSection` (site-sections), demote the runtime
   `jsonObjectSchema.parse` to an assertion (unreachable-by-construction),
   ship the site-lane breaking-change changeset.
