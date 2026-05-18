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

- Add an authored visibility field that is separate from lifecycle status.
- Make existing content backward-compatible by defaulting missing visibility to public.
- Let derivation jobs safely include more content entity types while skipping restricted sources by default.
- Allow every brain app to choose its own default derivation visibility; Relay is one example where trusted topics may be more appropriate than public topics.
- Keep the initial authoring surface simple while leaving room for richer permissions later.

## Non-goals

- Full multi-user access-control lists.
- Per-field visibility inside a single entity body.
- Retrofitting every entity with custom permission logic in the first pass.
- Automatically making public derived entities from restricted sources.

## Proposed model

Add a common entity field:

```ts
type Visibility = "anchor" | "trusted" | "public";
```

Markdown frontmatter:

```yaml
---
title: Internal workshop notes
visibility: anchor
---
```

Default:

```ts
visibility: "public";
```

### Visibility levels

| Visibility | Meaning                                                             | Typical readers                       |
| ---------- | ------------------------------------------------------------------- | ------------------------------------- |
| `public`   | Safe for public surfaces and public derivation                      | everyone                              |
| `trusted`  | Safe for trusted/private-space participants, but not the public web | anchor + trusted collaborators/agents |
| `anchor`   | Owner-only/private material                                         | anchor only                           |

This is an access lattice:

```txt
anchor > trusted > public
```

A caller at a higher trust level may access lower levels. A public caller may only access public entities.

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
visibility: trusted
```

means “ready for its intended audience, but not public.”

`status` remains lifecycle/workflow. `visibility` is access and derivation policy.

## Permission mapping

In the first implementation, visibility should compile to coarse permissions rather than exposing a large permissions object to authors.

| Visibility | Read    | Search  | Public site | Public derivation | Trusted derivation  | Anchor derivation |
| ---------- | ------- | ------- | ----------- | ----------------- | ------------------- | ----------------- |
| `public`   | public  | public  | eligible    | eligible          | eligible            | eligible          |
| `trusted`  | trusted | trusted | excluded    | excluded          | eligible            | eligible          |
| `anchor`   | anchor  | anchor  | excluded    | excluded          | excluded by default | eligible          |

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

Derived entities must not be more visible than the sources that shaped them.

Practical initial rule:

- a public derivation job reads only public sources and emits public derived entities;
- a trusted derivation job may read public + trusted sources and emits trusted derived entities;
- an anchor derivation job may read public + trusted + anchor sources and emits anchor derived entities.

This avoids leaking private notes into public topics.

## Topic extraction scope

Topic extraction should get an explicit target visibility/scope.

Suggested plugin config:

```ts
interface TopicsPluginConfig {
  includeEntityTypes?: string[];
  extractionVisibility?: "public" | "trusted" | "anchor"; // default: "public"
}
```

Semantics:

| `extractionVisibility` | Source visibilities           | Created/updated topic visibility |
| ---------------------- | ----------------------------- | -------------------------------- |
| `public`               | `public` only                 | `public`                         |
| `trusted`              | `public`, `trusted`           | `trusted`                        |
| `anchor`               | `public`, `trusted`, `anchor` | `anchor`                         |

Default Rover behavior should stay conservative:

```ts
topicsPlugin({
  extractionVisibility: "public",
});
```

Any brain app can override the topic extraction visibility:

```ts
topicsPlugin({
  extractionVisibility: "trusted",
});
```

Relay is one likely example: trusted extraction would let it extract useful shared-space topics without publishing them to a public surface, while still skipping anchor-only notes.

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

- Public/search-index contexts only see `visibility: public`.
- Trusted contexts see `public` + `trusted`.
- Anchor contexts see all visibility levels, unless a specific tool requests a narrower scope.

For existing `system_search`, default the scope from the caller permission level. Later, add explicit query parameters if needed:

```ts
visibilityScope?: "public" | "trusted" | "anchor";
```

## Site and remote-agent behavior

Public site generation should include only public entities.

Trusted interfaces or shared spaces may render trusted entities, but only behind the relevant access boundary.

Remote agent context should default to public-only unless the calling workflow explicitly grants trusted or anchor context.

## Migration

1. Add the visibility type and schema helper in a shared package.
2. Update markdown adapters to preserve/read/write `visibility` where available.
3. Default missing visibility to `public` during read/validation.
4. Add search/index filters by caller scope.
5. Add derivation source filtering by target visibility.
6. Add topic extraction visibility config with default `public`.
7. Broaden topic source entity configuration to extractable content types.
8. Let each brain app set its own topic `extractionVisibility`; configure Relay with `"trusted"` if product behavior confirms that shared-space topics should not be public.

No bulk content migration is required for existing public content. Operators can mark specific entities as restricted by adding frontmatter:

```yaml
visibility: anchor
```

or:

```yaml
visibility: trusted
```

## Validation

Add tests for:

- schema defaulting missing visibility to `public`;
- markdown round-tripping visibility;
- public search excluding trusted/anchor entities;
- trusted search including public+trusted but excluding anchor;
- anchor search including all levels;
- public topic extraction skipping trusted/anchor sources;
- trusted topic extraction including public+trusted and emitting trusted topics;
- anchor topic extraction including all sources and emitting anchor topics;
- broad “generate topics” eval still invoking `system_extract({ entityType: "topic" })`.

## Open questions

- Should an anchor-scoped topic extraction include anchor notes by default, or should anchor notes require an additional explicit opt-in?
- Should derived topics always use the configured target visibility, or use the least-restrictive visibility allowed by their actual source set?
- Do we need a separate `shareableWithAgents` policy, or is trusted visibility enough for the first version?
