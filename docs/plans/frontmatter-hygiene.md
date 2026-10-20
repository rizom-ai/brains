# Plan: Frontmatter hygiene

Last updated: 2026-10-19

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

`EntityTypeConfig` gains `retiredFields: string[]`, the keys a type no longer owns. The registry:

- drops them before parsing stored frontmatter, so strict schemas accept old files;
- never counts them as extensions, so `preserveSourceFrontmatter` does not write them back and ownership rules that treat unknown keys as extensions (action items) ignore them;
- drops them on the next serialization of the entity.

A field whose value moves rather than disappears (an id derived differently, a nested shape flattened) keeps a read-time translation in the owning package, as action items do for `timeRange` → `capturedAt` and nested people.

### Rewrite job

There is no bulk mechanism for rewriting stored entities today (`migrateEntities` migrates the SQL schema only). A `rewrite-entities` job re-serializes every entity of one type without changing its content, so retired fields leave stored files and the read-time translations can eventually be removed. It is run once per brain after a trim ships; each trim's legacy-inventory entry names "rewrite has run on every supported brain" as its removal prerequisite.

### Runtime state for bookkeeping

Refresh and retry state moves to the plugin's runtime-state namespace (`context.runtimeState`), keyed by entity id. A missing runtime-state record means "never checked"; the background loop rebuilds it on its next pass.

## Trims

Each trim is verified against current readers. "Drop" means: add to `retiredFields`, stop writing, update readers to the derived value.

### Conversation memory (`entities/conversation-memory`)

- **decision:** drop `sourceSummaryId` (always equals `conversationId`), `sourceMessageCount` and `projectionVersion` (no readers), and `spaceId` (the retriever already derives `interfaceType:channelId`).
- **summary:** drop `projectionVersion` (no reader; the version is folded into `sourceHash`); drop `conversationId` (equals the id; `widgets/coverage.ts` and `summary-datasource.ts` switch to the id); drop `entryCount` (derived from the body, as `summary-datasource.ts` already does; the coverage widget and retriever switch to it).
- **action-item:** move its retired list from `stored-shape.ts` onto `retiredFields`; the person and `capturedAt` translations stay.

### Agents (`entities/agent-discovery`)

- Drop `cardObservedAt` and `cardLastCheckedAt` (never read).
- Drop `a2aEndpoint` (always equals `url`; its one reader, `agent-set-trust-level.ts`, already falls back to `url`).
- Drop `did` (always equals `brainDid`; its one reader, `agent-detail.tsx`, switches to `brainDid`) and `anchorDid` (never read).
- Move `cardCid`, `cardLastError`, `cardFailureCount`, `cardUnavailableAt` and `cardStaleAfter` to runtime state; only `lib/atproto-card-events.ts` reads them.

### Publishing

- **post:** drop `ogDescription` and `twitterCard` (never read or written by code) and `atprotoUri` (written after publishing, never read).
- **newsletter:** drop `buttondownId` and `resendBroadcastId`: the Buttondown and Resend providers stop declaring a publish result id field.

### Small types

- **doc:** drop `sourcePath` (written only by `scripts/sync-docs-content.ts`).
- **site-content:** drop `routeId` and `sectionId` (the resolver looks entities up by the `route:section` id), including in the team recipe's seed content.
- **link:** drop `domain` (always the URL's hostname; its readers, `link-list/layout.tsx` and the ATProto projection, derive it).
- **traffic-snapshot:** drop `start`, `end` and `week` (all derived from the id, an ISO week; the adapter takes the title week from the id).
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

1. **Mechanism on one type.** `retiredFields`, the serializer and extension changes, and the `rewrite-entities` job, proven on post (`ogDescription`, `twitterCard`, `atprotoUri`) end to end: an old post file imports, renders, and loses the fields after a rewrite. Legacy inventory entry per trim.
2. **Conversation memory.** Decision and summary trims; action items move onto `retiredFields`. Eval fixtures updated.
3. **Agents.** Runtime state for card refresh, then the field drops.
4. **Publishing and small types.** Newsletter, doc, site-content (with seed content), link, traffic-snapshot, mail-item, email-reply-draft.

Each phase ships with its tests and is verified in a running test app: an entity stored before the trim imports cleanly, renders as before, and is stored without the retired fields after the rewrite job.

## Non-goals

- Renaming fields that are inconsistent across types (`coverImageId` vs `ogImageId`, the six source-reference shapes, timestamp names). That is a separate decision with its own migrations.
- Flattening conversation-memory people on decisions and summaries (`decidedBy`, `participants`); they keep their identity shape until a reader needs otherwise.
- Changing what the publishing pipeline writes beyond provider ids nobody reads.
