# Entity visibility and derived scope

## Status

Planned.

## Problem

Brains currently mix several concerns when deciding which entities can be read, searched, published, or used as derivation sources:

- lifecycle status, such as `draft` or `published`;
- entity type allowlists, such as topics extracting from only posts, decks, projects, links, and anchor profiles;
- implicit assumptions that notes/base content is private or not intended for derivation.

This makes broad requests like “generate topics from my current content” fragile. The assistant may search for notes instead of invoking derivation, while the topic plugin cannot safely whitelist more entity types without risking private-content leakage.

We need a small, general abstraction for content visibility that can be shared by search, publication, derivation, remote context, and site generation.

## Goals

- Add an optional authored content audience field that is separate from lifecycle status.
- Make existing content backward-compatible by treating missing audience as public.
- Let derivation jobs safely include more content entity types while skipping restricted sources by default.
- Allow every brain app to choose its own default derivation audience; Relay is one example where shared topics may be more appropriate than public topics.
- Keep the initial authoring surface simple while leaving room for richer permissions later.

## Non-goals

- Full multi-user access-control lists.
- Per-field visibility inside a single entity body.
- Retrofitting every entity with custom permission logic in the first pass.
- Automatically making public derived entities from restricted sources.

## Proposed model

Add an optional authored content audience field:

```ts
type ContentAudience = "public" | "shared" | "private";
```

Markdown frontmatter:

```yaml
---
title: Internal workshop notes
audience: private
---
```

Default/effective value:

```ts
audience ?? "public";
```

Do not require every existing entity to physically carry this field. Raw frontmatter and metadata may omit `audience`; shared policy helpers should normalize the effective audience at query/derivation boundaries.

### Storage

`audience` is a top-level column on the `entities` table, not a field inside the `metadata` JSON blob. Reasons:

- search and derivation must filter at the query/index level (see Search behavior) to avoid snippet leakage; SQL filters on real columns are indexable and consistent with sibling filters like `entityType` / `excludeTypes` in `shell/entity-service/src/entity-search.ts`;
- audience is a cross-cutting entity concern (like status and timestamps), not type-specific metadata;
- existing apps automigrate via drizzle (`shell/entity-service/src/migrate.ts` → `shell/entity-service/drizzle/`); adding the column with `DEFAULT 'public' NOT NULL` backfills existing rows on next startup, with no content rewrite required.

On-disk markdown stays untouched unless an author writes `audience:` in frontmatter; the adapter normalizes missing audience to `public` on read.

#### Frontmatter round-trip

The serialization rule is **omit-if-default**:

- on read, missing `audience` normalizes to `public`;
- on write, the adapter emits `audience:` only when the value is non-default (`shared` or `private`);
- a `public`-audience entity must round-trip with no `audience` line added.

This matters especially for base notes, which must remain valid with **no frontmatter at all**. The adapter must not introduce a frontmatter block (or an `audience:` line within an existing block) on a `public` entity, even after a regeneration pass. Authors mark restriction explicitly; the absence of any marker is the signal for `public`.

### Audience levels

| Audience  | Meaning                                                        | Typical readers                       |
| --------- | -------------------------------------------------------------- | ------------------------------------- |
| `public`  | Safe for public surfaces and public derivation                 | everyone                              |
| `shared`  | Safe for collaborators/shared-space agents, but not public web | anchor + trusted collaborators/agents |
| `private` | Owner-only/private material                                    | anchor only                           |

This is an access lattice:

```txt
private > shared > public
```

A caller at a higher trust level may access lower-audience entities. A public caller may only access public entities.

Internally, audiences map onto existing permission levels:

| Content audience | Minimum caller permission |
| ---------------- | ------------------------- |
| `public`         | `public`                  |
| `shared`         | `trusted`                 |
| `private`        | `anchor`                  |

This keeps content authoring language separate from permission-system language.

## Keep status separate

Do not encode visibility in `status`.

Examples:

```yaml
status: draft
audience: public
```

means “not ready/published yet, but not secret.”

```yaml
status: published
audience: shared
```

means “ready for its intended audience, but not public.”

`status` remains lifecycle/workflow. `audience` is access and derivation policy.

## Permission mapping

In the first implementation, audience should compile to coarse permissions rather than exposing a large permissions object to authors.

| Audience  | Read    | Search  | Public site | Public derivation | Shared derivation   | Private derivation |
| --------- | ------- | ------- | ----------- | ----------------- | ------------------- | ------------------ |
| `public`  | public  | public  | eligible    | eligible          | eligible            | eligible           |
| `shared`  | trusted | trusted | excluded    | excluded          | eligible            | eligible           |
| `private` | anchor  | anchor  | excluded    | excluded          | excluded by default | eligible           |

Public site eligibility still requires the usual lifecycle/publishing conditions, such as `status: published`; `audience: public` alone must not publish drafts.

Future versions can expand this into a richer policy object if needed, but `audience` should stay as the common shorthand.

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

Derived entities must not target a broader audience than the sources that shaped them.

Practical initial rule:

- a public derivation job reads only public sources and emits public derived entities;
- a shared derivation job may read public + shared sources and emits shared derived entities;
- a private derivation job may read public + shared + private sources and emits private derived entities.

This avoids leaking private notes into public or shared topics.

## Topic extraction scope

Topic extraction should get an explicit target audience/scope.

Suggested plugin config:

```ts
interface TopicsPluginConfig {
  includeEntityTypes?: string[];
  extractionAudience?: "public" | "shared" | "private"; // default: "public"
}
```

Semantics:

| `extractionAudience` | Source audiences              | Created/updated topic audience |
| -------------------- | ----------------------------- | ------------------------------ |
| `public`             | `public` only                 | `public`                       |
| `shared`             | `public`, `shared`            | `shared`                       |
| `private`            | `public`, `shared`, `private` | `private`                      |

Default Rover behavior should stay conservative:

```ts
topicsPlugin({
  extractionAudience: "public",
});
```

Any brain app can override the topic extraction audience:

```ts
topicsPlugin({
  extractionAudience: "shared",
});
```

Relay is one likely example: shared extraction would let it extract useful shared-space topics without publishing them to a public surface, while still skipping private notes.

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

- Public/search-index contexts only see `audience: public` or missing audience.
- Trusted contexts see public + shared entities.
- Anchor contexts see all audience levels, unless a specific tool requests a narrower scope.

Filtering should happen in entity/search query inputs or index filters, not only after results are returned, so snippets and semantic matches cannot leak restricted content.

For existing `system_search`, default the scope from the caller permission level. Later, add explicit query parameters if needed:

```ts
audienceScope?: "public" | "shared" | "private";
```

## Site and remote-agent behavior

Public site generation should include only entities that are both public-audience and lifecycle-eligible for publication.

Trusted interfaces or shared spaces may render shared entities, but only behind the relevant access boundary.

Remote agent context should default to public-only unless the calling workflow explicitly grants shared or private context.

## Migration

1. Add the audience type and schema/helper in a shared package.
2. Add the `audience` column to the `entities` table with `DEFAULT 'public' NOT NULL`; generate the drizzle migration so existing apps automigrate on next startup.
3. Update markdown adapters to preserve/read/write optional `audience` where available.
4. Normalize missing audience to effective `public` during policy checks.
5. Add search/index filters by caller scope (filter in the SQL query, not after results return).
6. Add derivation source filtering by target audience.
7. Add topic extraction audience config with default `public`.
8. Broaden topic source entity configuration to extractable content types.
9. Let each brain app set its own topic `extractionAudience`; configure Relay with `"shared"` if product behavior confirms that shared-space topics should not be public.

No bulk content migration is required for existing public content. Operators can mark specific entities as restricted by adding frontmatter:

```yaml
audience: private
```

or:

```yaml
audience: shared
```

## Validation

Add tests for:

- policy helpers treating missing audience as `public`;
- markdown round-tripping optional audience;
- public search excluding shared/private entities;
- trusted search including public+shared but excluding private;
- anchor search including all levels;
- public topic extraction skipping shared/private sources;
- shared topic extraction including public+shared and emitting shared topics;
- private topic extraction including all sources and emitting private topics;
- broad “generate topics” eval still invoking `system_extract({ entityType: "topic" })`.

## Open questions

Resolved for v1:

- Setting `extractionAudience: private` is the single switch that includes private sources; no per-entity opt-in is required in v1. Finer-grained control belongs in the future `EntityAccessPolicy` shape, not as an ad-hoc flag.
- Derived topics use the configured target audience.
- Do not merge derived topics across audience boundaries in v1; public, shared, and private topics remain distinct if their audiences differ.
- Do not add a separate `shareableWithAgents` policy in v1; shared audience is enough.

Remaining question:

- Should we support `private: true` as a backward-compatible authoring alias for `audience: private`, or avoid aliases until there is clear demand?
