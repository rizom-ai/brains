# Plan: Frontmatter hygiene

Last updated: 2026-10-20

## Status

Proposed. The action-item trim (PR #664) is the first instance: an action item now carries only what a card uses, and items stored in the old shape are read through `shared/action-items/src/stored-shape.ts` and rewritten on their next write. This plan generalizes that into a platform mechanism and applies it to the other entity types with verified cruft.

## Rule

Frontmatter carries what a person authors or reads, plus provenance the entity cannot reconstruct. Everything else stays out of the file:

- **Duplicates** of the id, of another field, or of the entity's own `created`/`updated` are not stored.
- **Derivable values** (a hostname from a URL, a date range from an ISO week, a count of body entries) are computed when read.
- **Bookkeeping** that only drives a background loop (refresh state, retry counters, last-checked times) lives in the owning plugin's runtime state, not in the entity.
- **Unread fields** are not written.

A field stays when any reader depends on it and it cannot be derived, even if it looks redundant (see [Kept on purpose](#kept-on-purpose)).

## Why

Stored entities are the brain's durable, human-readable record; a person opening a file should see its content, not the machinery that produced it. Today three platform behaviors grow frontmatter on every type:

- `BaseEntityAdapter.toMarkdown` (`shell/entity-service/src/adapters/base-entity-adapter.ts`) starts from the stored frontmatter and writes every metadata key the frontmatter schema lists. Types whose frontmatter schema is their metadata schema (summary, decision, action-item, site-content) put all their metadata in the file.
- `preserveSourceFrontmatter` (`shell/entity-service/src/frontmatter-extensions.ts`) adds back, on every serialize, any stored key the owner schema does not claim. A field removed from a schema therefore stays in stored files indefinitely, and a strict schema then rejects those files.
- The publishing pipeline (`plugins/content-pipeline/src/publish-state-updater.ts`) writes a provider id field into any publishable entity whose provider declares one, whether or not anything reads it.

The second point is why trimming needs a mechanism: removing a field from a schema does not remove it from stored data.

## Mechanism

### Retired fields

`EntityTypeConfig.retiredFields` lists the keys a type no longer owns: a top-level key, or a key one level inside an object as `parent.key` (mail items retire `source.senderKey`). The serializer:

- parses stored frontmatter past them, so strict schemas accept old files;
- never writes them back: `preserveSourceFrontmatter` skips them, and they leave the metadata column;
- leaves files without them byte for byte as before.

A retired field leaves the metadata column too, so registration refuses a type whose metadata schema still declares one.

Creates, updates and projection writes drop retired fields from the content before validation, so a persist validator that parses the file accepts an entity stored before a retirement.

A field whose value moves rather than disappears (an id derived differently, a nested shape flattened) keeps a read-time translation in the owning package, as action items do for `timeRange` → `capturedAt` and nested people. When the old key itself goes, the type lists it in `EntityTypeConfig.translatedFields`: it still reaches the parser, but like a retired field it is never written back and is rewritten on start.

### Rewrite on start

Every serving start, after grouping reprojection, `rewriteRetiredFields` scans the stored rows of each type with retired fields and rewrites those still carrying one. A clean brain pays one scan per such type; a rewritten entity is exported like any other change, so directory sync carries the trim into files. A file imported into a brain whose row is already clean (a brain bootstrapped from its content repository, say) is written back in its stored form when that form drops one of the file's fields; files that differ only in form are left alone. Retired lists stay declared: once stored data is clean they cost nothing, and they keep an old file imported later from turning into an error.

### Runtime state for bookkeeping

Refresh and retry state moves to the plugin's runtime-state namespace (`context.runtimeState`), keyed by entity id. A missing runtime-state record means "never checked"; the background loop rebuilds it on its next pass.

## Trims

Each trim is verified against current readers. "Drop" means: add to `retiredFields`, stop writing, update readers to the derived value.

### Conversation memory (`entities/conversation-memory`)

- **decision:** drop `sourceSummaryId` (always equals `conversationId`), `sourceMessageCount` and `projectionVersion` (no readers), and `spaceId` (the retriever already derives `interfaceType:channelId`).
- **summary:** drop `projectionVersion` (no reader; the version is folded into `sourceHash`); drop `conversationId` (equals the id; `widgets/coverage.ts` and `summary-datasource.ts` switch to the id); drop `entryCount` (derived from the body, as `summary-datasource.ts` already does; the coverage widget and retriever switch to it).
- **action-item:** move its retired list from `stored-shape.ts` onto `retiredFields`, and `timeRange` onto `translatedFields`; the person and `capturedAt` translations stay.

### Agents (`entities/agent-discovery`)

- Drop `cardObservedAt` and `cardLastCheckedAt` (never read).
- Drop `a2aEndpoint` (always equals `url`; its one reader, `agent-set-trust-level.ts`, already falls back to `url`).
- Drop `did` (always equals `brainDid`; its one reader, `agent-detail.tsx`, switches to `brainDid`) and `anchorDid` (never read).
- Move `cardCid`, `cardLastError`, `cardFailureCount`, `cardUnavailableAt` and `cardStaleAfter` to runtime state (`agent-discovery.card-refresh`, keyed by agent id); only `lib/atproto-card-events.ts` reads them. Stored values carry live state (failure counts, stale deadlines), so the move is expand-then-contract: the refresh loop seeds an agent's record from its stored fields the first time it meets it and stops writing them; a later release retires the five fields once every brain has run a refresh pass.

### Publishing

- **post:** drop `ogDescription` and `twitterCard` (never read or written by code) and `atprotoUri` (written after publishing, never read).
- **newsletter:** drop `buttondownId` and `resendBroadcastId`: the Buttondown and Resend providers stop declaring a publish result id field.

### Small types

- **doc:** drop `sourcePath` (written only by `scripts/sync-docs-content.ts`).
- **site-content:** drop `routeId` and `sectionId` (the resolver looks entities up by the `route:section` id), including in the team recipe's seed content.
- **link:** drop `domain` (always the URL's hostname; its readers, `link-list/layout.tsx` and the ATProto projection, derive it).
- **traffic-snapshot:** drop `start`, `end` and `week` from frontmatter and metadata (all follow from the snapshot's days; the adapter takes the title week from them).
- **mail-item:** drop `source.senderKey` and `source.domain` (written, never read).
- **email-reply-draft:** drop `updatedAt`; its one reader, `operator.ts`, switches to the entity's `updated`.

## Kept on purpose

Verified as needed despite looking redundant:

- `slug` on post, deck, project and doc: routes look entities up by slug, and generated ids can differ from it.
- post `canonicalUrl` (ATProto projection, printable provider), `ogImage` and `ogImageId` (both resolved).
- agent `brainName` (the brain's name, distinct from the anchor's `name`), `discoveredAt` (reset on reconnect; sorts the network list), `repoDid`, `brainDid`.
- summary `sourceHash` (projector skip check, coverage staleness).
- decision `timeRange` (decisions widget).
- social-post `platform`, `title` (the id derives from it) and `documents`.
- link `capturedAt` (sort key, set after capture) and `source`.
- prompt `target` and `title`.
- contact-request `expiresAt` (the retention promise at receipt; deriving it later would change it).
- anchor-profile `email` and `website` (independent of `socialLinks`).
- email-reply-draft `mailItemId` (the id is a one-way hash of it).
- traffic-snapshot `days` (the source of truth; the body is rendered from it).

## Phases

1. **Mechanism on one type.** `retiredFields`, the serializer changes and the rewrite on start, proven on post (`ogDescription`, `twitterCard`, `atprotoUri`) end to end: an old post file imports, renders, and loses the fields after a start.
2. **Conversation memory.** Decision and summary trims; action items move onto `retiredFields`. Eval fixtures updated.
3. **Agents.** The field drops, and card refresh state moves to runtime state, seeded from the stored fields. One release later, the five card state fields are retired.
4. **Publishing and small types.** Newsletter, doc, site-content (with seed content), link, traffic-snapshot, mail-item, email-reply-draft.

Each phase ships with its tests and is verified in a running test app: an entity stored before the trim imports cleanly, renders as before, and is stored without the retired fields after a start.

## Non-goals

- Renaming fields that are inconsistent across types (`coverImageId` vs `ogImageId`, the six source-reference shapes, timestamp names). That is a separate decision with its own migrations.
- Flattening conversation-memory people on decisions and summaries (`decidedBy`, `participants`); they keep their identity shape until a reader needs otherwise.
- Changing what the publishing pipeline writes beyond provider ids nobody reads.
