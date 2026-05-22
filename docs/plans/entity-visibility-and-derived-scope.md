# Entity visibility and derived scope

## Status

Implemented first pass. The core visibility model is in runtime entities and entity storage; `public` / `shared` / `restricted` visibility is normalized, queryable, and enforced across permission-scoped read/search/list/update paths. This plan remains as the policy/design record and for future derivation-policy refinement.

## Problem

Brains currently mix several concerns when deciding which entities can be read, searched, published, or used as derivation sources:

- lifecycle status, such as `draft` or `published`;
- entity type allowlists, such as topics extracting from only posts, decks, projects, links, and anchor profiles;
- implicit assumptions that notes/base content is restricted or not intended for derivation.

This makes broad requests like “generate topics from my current content” fragile. The assistant may search for notes instead of invoking derivation, while the topic plugin cannot safely whitelist more entity types without risking restricted-content leakage.

We need a small, general abstraction for content visibility that can be shared by search, publication, derivation, remote context, and site generation.

## Goals

- Add an optional authored content visibility field that is separate from lifecycle status.
- Make existing content backward-compatible by treating missing visibility as public.
- Let derivation jobs safely include more content entity types while skipping restricted sources by default.
- Allow every brain app to choose its own default derivation visibility; Relay is one example where shared topics may be more appropriate than public topics.
- Keep the initial authoring surface simple while leaving room for richer permissions later.

## Non-goals

- Full multi-user access-control lists.
- Per-field visibility/access control inside a single entity body.
- Retrofitting every entity with custom permission logic in the first pass.
- Automatically making public derived entities from restricted sources.

## Proposed model

Add an optional authored content visibility field:

```ts
type ContentVisibility = "public" | "shared" | "restricted";
type RawContentVisibility = ContentVisibility | "private";
```

Canonical markdown frontmatter:

```yaml
---
title: Internal workshop notes
visibility: restricted
---
```

`private` is accepted as an input synonym for `restricted`:

```yaml
visibility: private
```

The system normalizes that to canonical `restricted`. Runtime entities, database rows, and exported markdown should use only canonical values.

Default/effective value:

```ts
visibility ?? "public";
```

Do not require every existing entity to physically carry this field. Raw frontmatter and metadata may omit `visibility`; shared policy helpers should normalize the effective visibility at query/derivation boundaries.

### Storage

`visibility` is a top-level column on the `entities` table, not a field inside the `metadata` JSON blob. Reasons:

- search and derivation must filter at the query/index level (see Search behavior) to avoid snippet leakage; SQL filters on real columns are indexable and consistent with sibling filters like `entityType` / `excludeTypes` in `shell/entity-service/src/entity-search.ts`;
- visibility is a cross-cutting entity concern (like status and timestamps), not type-specific metadata;
- existing apps automigrate via drizzle (`shell/entity-service/src/migrate.ts` → `shell/entity-service/drizzle/`); adding the column with `DEFAULT 'public' NOT NULL` backfills existing rows on next startup, with no content rewrite required.

Use a DB-level constraint if supported by the existing migration pattern:

```sql
visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'shared', 'restricted'))
```

If the migration tooling makes a check constraint awkward, enforce the same enum strictly at all mutation/import boundaries after normalizing the `private` input synonym to `restricted`.

On-disk markdown stays untouched unless an author writes `visibility:` in frontmatter; the adapter normalizes missing visibility to `public` on read.

### Source of truth

The runtime/source-of-truth value is the `entities.visibility` column.

Frontmatter `visibility:` is the import/export authoring representation. It should be parsed into the top-level column and removed from metadata before persistence. Runtime code should not read `metadata.visibility` as policy state.

Hydrated runtime entities should expose a normalized top-level field:

```ts
interface BaseEntity {
  id: string;
  entityType: string;
  content: string;
  visibility: ContentVisibility; // normalized, defaults to "public"
  metadata: Record<string, unknown>;
  created: string;
  updated: string;
  contentHash: string;
}
```

Raw create/import inputs may omit visibility; entity-service persistence should normalize it to `public`. If raw input uses `visibility: private`, persistence should normalize it to `restricted` before validation/storage.

#### Frontmatter round-trip

The serialization rule is **omit-if-default**:

- on read, missing `visibility` normalizes to `public`;
- on read, `visibility: private` normalizes to `restricted`;
- on write, the adapter emits `visibility:` only when the value is non-default (`shared` or `restricted`);
- a public-visibility entity must round-trip with no `visibility` line added;
- exported markdown should write `visibility: restricted`, never `visibility: private`.

This matters especially for base notes, which must remain valid with **no frontmatter at all**. The adapter must not introduce a frontmatter block (or a `visibility:` line within an existing block) on a `public` entity, even after a regeneration pass. Authors mark restriction explicitly; the absence of any marker is the signal for `public`.

#### Import/export and update semantics

Directory-sync/import should:

- parse `visibility:` from frontmatter into the top-level DB column;
- normalize missing `visibility` to `public`;
- normalize `visibility: private` to `restricted`;
- reject invalid visibility values;
- avoid storing `visibility` inside metadata JSON.

Directory-sync/export should:

- omit `visibility:` for public entities;
- write `visibility: shared` or `visibility: restricted` for non-public entities;
- never write `visibility: private`;
- continue allowing base notes with no frontmatter when no other frontmatter is needed.

System update flows should treat `visibility` like a top-level entity field, not metadata. A request such as:

```json
{ "fields": { "visibility": "shared" } }
```

updates the `entities.visibility` column. It must not write `metadata.visibility`.

A request using the synonym:

```json
{ "fields": { "visibility": "private" } }
```

should update the column to canonical `restricted`.

### Visibility levels

| Visibility   | Meaning                                                        | Typical readers                       |
| ------------ | -------------------------------------------------------------- | ------------------------------------- |
| `public`     | Safe for public surfaces and public derivation                 | everyone                              |
| `shared`     | Safe for collaborators/shared-space agents, but not public web | anchor + trusted collaborators/agents |
| `restricted` | Not for public or shared contexts                              | anchor only                           |

This is an access lattice:

```txt
restricted > shared > public
```

A caller at a higher trust level may access lower-visibility entities. A public caller may only access public entities.

Internally, visibility maps onto existing permission levels:

| Content visibility | Minimum caller permission |
| ------------------ | ------------------------- |
| `public`           | `public`                  |
| `shared`           | `trusted`                 |
| `restricted`       | `anchor`                  |

This keeps content authoring language separate from permission-system language while avoiding the ambiguity of `private` as the canonical stored value.

## Keep status separate

Do not encode visibility in `status`.

Examples:

```yaml
status: draft
visibility: public
```

means “not ready/published yet, but not secret.”

```yaml
status: published
visibility: shared
```

means “ready for its intended visibility boundary, but not public.”

`status` remains lifecycle/workflow. `visibility` is access and derivation policy.

## Permission mapping

In the first implementation, visibility should compile to coarse permissions rather than exposing a large permissions object to authors.

| Visibility   | Read    | Search  | Public site | Public derivation | Shared derivation   | Restricted derivation |
| ------------ | ------- | ------- | ----------- | ----------------- | ------------------- | --------------------- |
| `public`     | public  | public  | eligible    | eligible          | eligible            | eligible              |
| `shared`     | trusted | trusted | excluded    | excluded          | eligible            | eligible              |
| `restricted` | anchor  | anchor  | excluded    | excluded          | excluded by default | eligible              |

Public site eligibility still requires the usual lifecycle/publishing conditions, such as `status: published`; `visibility: public` alone must not publish drafts.

Future versions can expand this into a richer policy object if needed, but `visibility` should stay as the common shorthand.

Possible future internal shape:

```ts
interface EntityAccessPolicy {
  read: "public" | "trusted" | "anchor";
  search: "public" | "trusted" | "anchor" | "none";
  derive: "public" | "trusted" | "anchor" | "none";
  publish: boolean;
}
```

## Derivation rule

Derived entities must not target a broader visibility than the sources that shaped them.

Practical initial rule:

- a public derivation job reads only public sources and emits public derived entities;
- a shared derivation job may read public + shared sources and emits shared derived entities;
- a restricted derivation job may read public + shared + restricted sources and emits restricted derived entities.

This avoids leaking restricted notes into public or shared topics.

## Topic extraction scope

Topic extraction should get an explicit target visibility/scope.

Suggested plugin config:

```ts
interface TopicsPluginConfig {
  includeEntityTypes?: string[];
  extractionVisibility?: "public" | "shared" | "restricted"; // default: "public"
}
```

Semantics:

| `extractionVisibility` | Source visibilities              | Created/updated topic visibility |
| ---------------------- | -------------------------------- | -------------------------------- |
| `public`               | `public` only                    | `public`                         |
| `shared`               | `public`, `shared`               | `shared`                         |
| `restricted`           | `public`, `shared`, `restricted` | `restricted`                     |

Default Rover behavior should stay conservative:

```ts
topicsPlugin({
  extractionVisibility: "public",
});
```

Any brain app can override the topic extraction visibility:

```ts
topicsPlugin({
  extractionVisibility: "shared",
});
```

Relay is one likely example: shared extraction would let it extract useful shared-space topics without publishing them to a public surface, while still skipping restricted notes.

## Entity-type inclusion

Visibility lets us broaden extraction without treating notes/base as inherently special.

Do not literally extract from every registered entity type. Instead define “extractable content entity types” and include those broadly:

- posts
- decks
- projects
- links
- base/notes
- summaries, if applicable
- brain-specific content types that opt into extraction

Exclude system/derived/operational types by default:

- topics
- prompts
- images
- site-info
- credentials or runtime/operator records
- other derived entities unless explicitly opted in

## Search behavior

Search must filter by caller trust level.

- Public/search-index contexts only see `visibility: public` or missing visibility.
- Trusted contexts see public + shared entities.
- Anchor contexts see all visibility levels, unless a specific tool requests a narrower scope.

Filtering should happen in entity/search query inputs or index filters, not only after results are returned, so snippets and semantic matches cannot leak restricted content.

For existing `system_search`, default the scope from the caller permission level. Later, add explicit query parameters if needed:

```ts
visibilityScope?: "public" | "shared" | "restricted";
```

## Site and remote-agent behavior

Public site generation should include only entities that are both public-visibility and lifecycle-eligible for publication.

Trusted interfaces or shared spaces may render shared entities, but only behind the relevant access boundary.

Remote agent context should default to public-only unless the calling workflow explicitly grants shared or restricted context.

## Migration

1. Add the visibility type and schema/helper in a shared package.
2. Add the `visibility` column to the `entities` table with `DEFAULT 'public' NOT NULL`; generate the drizzle migration so existing apps automigrate on next startup.
3. Update `BaseEntity`, `baseEntitySchema`, DB row mapping, entity reconstruction, and create/update/upsert paths to carry normalized top-level `visibility`.
4. Update markdown adapters/import/export to preserve/read/write optional `visibility` where available, with omit-if-default serialization and `private` → `restricted` normalization on import.
5. Normalize missing visibility to effective `public` during policy checks.
6. Add search/index filters by caller scope (filter in the SQL query, not after results return).
7. Add derivation source filtering by target visibility.
8. Add topic extraction visibility config with default `public`.
9. Broaden topic source entity configuration to extractable content types.
10. Let each brain app set its own topic `extractionVisibility`; configure Relay with `"shared"` if product behavior confirms that shared-space topics should not be public.

No bulk content migration is required for existing public content. Operators can mark specific entities as non-public by adding frontmatter:

```yaml
visibility: restricted
```

or:

```yaml
visibility: shared
```

For compatibility/author ergonomics, this input is also accepted and normalized to `restricted`:

```yaml
visibility: private
```

## Validation

Add tests for:

- policy helpers treating missing visibility as `public`;
- base entity schema and DB row mapping exposing normalized top-level `visibility`;
- mutation/import rejecting invalid visibility values;
- mutation/import normalizing `visibility: private` to `restricted`;
- `system_update({ fields: { visibility } })` updating the top-level column, not metadata;
- markdown round-tripping optional visibility with omit-if-default behavior;
- markdown export writing `visibility: restricted`, never `visibility: private`;
- directory import/export keeping public base notes frontmatter-free when possible;
- public search excluding shared/restricted entities;
- trusted search including public+shared but excluding restricted;
- anchor search including all levels;
- public topic extraction skipping shared/restricted sources;
- shared topic extraction including public+shared and emitting shared topics;
- restricted topic extraction including all sources and emitting restricted topics;
- broad “generate topics” eval still invoking `system_extract({ entityType: "topic" })`.

## Open questions

Resolved for v1:

- Setting `extractionVisibility: restricted` is the single switch that includes restricted sources; no per-entity opt-in is required in v1. Finer-grained control belongs in the future `EntityAccessPolicy` shape, not as an ad-hoc flag.
- Derived topics use the configured target visibility.
- Do not merge derived topics across visibility boundaries in v1; public, shared, and restricted topics remain distinct if their visibilities differ.
- Do not add a separate `shareableWithAgents` policy in v1; shared visibility is enough.
- Support `visibility: private` as an input synonym for `visibility: restricted`, but do not store or export `private` as a canonical value.

No remaining v1 open questions.

Explicitly not included in v1:

- Do not support `private: true` as an alias. Only the `visibility` field is supported, and its canonical values are `public`, `shared`, and `restricted`.
