# @brains/entity-service

Entity persistence, markdown serialization, embeddings, and search for Brain applications.

## Overview

`@brains/entity-service` provides a typed entity registry plus CRUD operations backed by SQLite/libSQL. Entities are stored as markdown with frontmatter-derived metadata, while embeddings are generated asynchronously and stored in a separate embedding database.

## Features

- Typed entity registration with Zod schemas and markdown adapters
- Entity CRUD with immediate persistence
- Async embedding job enqueueing through `@brains/job-queue`
- Vector + FTS5 keyword search
- Metadata filtering, published filtering, pagination, and multi-field sorting
- Markdown/frontmatter serialization helpers
- Optional structural event bus for entity lifecycle notifications
- Separate entity and embedding databases

## Basic usage

```typescript
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { Logger } from "@brains/utils";

const logger = Logger.getInstance();
const registry = EntityRegistry.createFresh(logger);

registry.registerEntityType("note", noteSchema, noteAdapter, {
  weight: 1.2,
  embeddable: true,
});

const entityService = EntityService.createFresh({
  embeddingService,
  entityRegistry: registry,
  logger,
  jobQueueService,
  dbConfig: { url: "file:./entities.db" },
  embeddingDbConfig: { url: "file:./embeddings.db" },
  // Optional. Structural contract; does not require importing a concrete message bus here.
  messageBus: eventBus,
});

await entityService.initialize();

const { entityId, jobId } = await entityService.createEntity({
  entity: {
    entityType: "note",
    content: "---\ntitle: My Note\n---\n\nNote content...",
    metadata: { title: "My Note", tags: ["important"] },
  },
});

const note = await entityService.getEntity({
  entityType: "note",
  id: entityId,
});

const results = await entityService.search({
  query: "important notes about AI",
  options: {
    types: ["note"],
    limit: 10,
  },
});

if (note) {
  await entityService.updateEntity({
    entity: {
      ...note,
      content: "Updated content",
    },
  });
}

await entityService.deleteEntity({ entityType: "note", id: entityId });
```

## Hierarchy queries (internal client)

`queryEntityHierarchy()` is available on the existing entity-service client used by
Studio. It projects stored identity, not filesystem placement or composition order:

```typescript
const page = await entityService.queryEntityHierarchy({
  entityType: "book-section",
  prefix: ["book-1"], // null or omitted for the collection root
  visibilityScope: "shared",
  limit: 40,
  offset: 0,
});
// page.folders: [{ path, name, descendantCount }]
// page.entities: [{ entity, path }] — direct children only
// page.totalEntities and page.offset describe the direct-entry page.
```

Visibility defaults to public and is applied before deriving folders and counts.
Optional `filter` supports literal content search, metadata equality and exact visibility
(intersected with the caller scope). Folders are complete and ordered by their segment's
UTF-8 bytes; only direct entries page. Entries default to ID order; `sortFields` uses the
ordinary list sorting rules with an ID tie-breaker.

Set `includeDescendants: true` for a paged recursive result beneath the same prefix.
This mode returns no folder summaries; `totalEntities` counts all matching descendants
before pagination. A null prefix searches the whole collection. Visibility and filters
still apply before counting or returning entries. The default remains immediate children.

The entry limit defaults to 50 and accepts 1–100. More than 1,000 visible matching immediate
folders rejects the query rather than returning an incomplete folder list. Folder grouping
and entry paging run in SQLite. Nested prefixes use the existing ID index, with literal,
case-sensitive bounds supplied by the entity-path codec. No schema migration is needed.

Existing empty or path-like ID segments remain addressable through structured prefixes;
components containing the identity separator are rejected. New-path authoring still uses
the stricter `entityIdPathSchema`. Derived paths are returned outside entity data: neither
stored IDs nor metadata are modified. Filesystem placement remains directory-sync's job.

## Grouping queries (internal client)

A grouping is a declared dimension — Clients, Projects — resolved from one
frontmatter field across a listed set of entity types. Callers never supply a
field name or selector: `registerGrouping({ key, label, field, types })` records
the declaration, and the two reads resolve it by key.

`queryGroupingCatalog` returns each distinct value with the number of entities
the caller may read. `queryGroupingMembers` returns one mixed-type page for a
single value, with optional type, content-search and sort filters. Both
intersect the caller's admitted types with the declaration's own, so neither
side can widen the other, and both apply the caller's visibility scope. A value
no readable entity carries does not appear, and a restricted member reveals
nothing through counts, ordering or errors.

Values match exactly as stored: no slugging, case folding or normalisation.
The catalog orders values case-insensitively so related spellings read together,
with the stored bytes breaking ties. Missing, empty or non-array fields mean no
membership rather than a query error, and non-string elements are ignored.

Membership is a projection of authored frontmatter, never an independent store.
Ordinary writes maintain it. `reprojectRegisteredGroupings()` bootstraps rows
whose stored content already carries membership, in keyset pages, writing only
metadata: it leaves `updated`, source Markdown, identities and file paths alone
and emits no events or export intents. Each registered field is validated
against its own schema entry, so frontmatter the entity owner rejects elsewhere
in the document never removes an entity from its collections; a field whose own
value is invalid is left unprojected and unrepaired. Every serving start runs
the bounded pass, including when declarations are unchanged: register-only
writers with grouping disabled and changes to runtime field validators can
otherwise leave a previously completed projection stale. No declaration-only
completion cache or grouping-state migration is included.

## Conditional writes and recovery (internal runtime)

`getEntityWriteSnapshot()` reads the raw entity and its opaque revision together, using
an explicit visibility scope (public-only when omitted). Authorized runtime callers can
pass that revision to `updateEntity()`:

```typescript
const snapshot = await entityService.getEntityWriteSnapshot({
  entityType: "note",
  id: entityId,
  visibilityScope: "public",
});
if (snapshot) {
  await entityService.updateEntity({
    entity: { ...snapshot.entity, content: "Generated replacement" },
    options: {
      conditionalWrite: { expectedRevision: snapshot.revision },
    },
  });
}
```

For `createEntity()`, use an explicit ID and `expectedRevision: null`; conditional creates
cannot deduplicate IDs. A failed precondition throws `EntityWriteConflictError`. The
revision is derived from the stored row's content hash, metadata, and visibility, so any
writer's change is detected, including direct SQL, with no version table or triggers. An
identical state after a revert or recreate is the same revision: it is the state that was
authorized for replacement.

A conditional mutation commits the entity, FTS changes, and projection/export journals in
one SQLite transaction. Nothing records completion: a retry after acknowledgement loss
meets the changed revision and fails with `EntityWriteConflictError`, so a committed write
is never repeated or overwritten. Concurrent attempts can still both call an external
provider before either commits.

Create/update options also accept a runtime `signal`. Cancellation is checked before
validation and immediately before the entity write, including after awaited validation
or asset preparation. Once the write starts, the entity and its journals settle atomically;
late cancellation does not undo a committed entity. Search options accept a runtime
signal for query embedding and result-consumption checkpoints. Signals are not persisted.

Runtime callers may also supply `beforeWrite(entity)`, an asynchronous guard receiving the
final serialized fields after entity/persist validation and immediately before SQL mutation.
A thrown error rolls back the transaction, including projection/export state.
The guard must not mutate entities or perform nested writes. It is not called for no-op
skips. Durable generation uses it to recheck current authority and reject
validator-derived visibility/publication escalation. The hook is runtime-only; it does not
make auth-account changes atomic with the separate entity database.

These primitives do **not** grant authority: runtime callers must enforce current actor,
entity-action, visibility, and operation-access policy. Event publication and embedding
enqueue happen after the transaction and are not guaranteed to replay following
acknowledgement loss.

Revisions are derived from stored rows, so no table, migration, or trigger is added and no
revision data enters Markdown.

## Entity model

All entities extend `BaseEntity`:

```typescript
interface BaseEntity<TMetadata = Record<string, unknown>> {
  id: string;
  entityType: string;
  content: string;
  created: string; // ISO datetime
  updated: string; // ISO datetime
  metadata: TMetadata;
  contentHash: string;
}
```

Creation inputs omit system-managed fields such as `id`, timestamps, and `contentHash`; the service fills them in and computes hashes from serialized markdown.

## Entity registry

```typescript
import { EntityRegistry } from "@brains/entity-service";
import { Logger } from "@brains/utils";

const registry = EntityRegistry.createFresh(Logger.getInstance());

registry.registerEntityType("task", taskSchema, taskAdapter, {
  weight: 0.8,
  embeddable: true,
});

const types = registry.getAllEntityTypes();
const task = registry.validateEntity("task", taskData);
const adapter = registry.getAdapter("task");
```

## Entity adapters

Adapters define how an entity type is serialized to markdown and parsed back from markdown.

```typescript
interface EntityAdapter<
  TEntity extends BaseEntity,
  TMetadata = Record<string, unknown>,
> {
  entityType: string;
  schema: z.ZodSchema<TEntity>;
  toMarkdown(entity: TEntity): string;
  fromMarkdown(markdown: string): Partial<TEntity>;
  extractMetadata(entity: TEntity): TMetadata;
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter;
  generateFrontMatter(entity: TEntity): string;
  getBodyTemplate(): string;
}
```

Use `BaseEntityAdapter` for common frontmatter/body behavior.

## Search

```typescript
const results = await entityService.search({
  query: "machine learning concepts",
  options: {
    types: ["note", "article"],
    excludeTypes: ["image"],
    limit: 20,
    offset: 0,
    weight: { article: 1.5, note: 1.0 },
  },
});
```

Search combines vector similarity with an FTS5 keyword boost. Entity type weights are applied inside the SQL score expression.

## Event bus contract

Entity lifecycle events are optional. To avoid coupling this package to a concrete messaging implementation, pass any object that satisfies `EntityEventBus`:

```typescript
interface EntityEventBus {
  send(
    type: string,
    payload: Record<string, unknown>,
    sender: string,
    target?: string,
    metadata?: Record<string, unknown>,
    broadcast?: boolean,
  ): Promise<unknown>;
}
```

Emitted events include:

- `entity:created`
- `entity:updated`
- `entity:deleted`
- `entity:embedding:ready`

## Database schema

### Entities database

```sql
CREATE TABLE entities (
  id TEXT NOT NULL,
  entityType TEXT NOT NULL,
  content TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (id, entityType)
);
```

The service also ensures an `entity_fts` FTS5 table for keyword search.

### Embedding database

```sql
CREATE TABLE embeddings (
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  embedding F32_BLOB(<provider dimensions>) NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (entity_id, entity_type)
);
```

The embedding database is attached to the entity database as `emb` for search queries.

## Frontmatter utilities

```typescript
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";

const parsed = parseMarkdownWithFrontmatter(markdown, frontmatterSchema);
const markdown = generateMarkdownWithFrontmatter("Body", {
  title: "Example",
});
```

## Validation

From this package directory:

```bash
bun run lint
bun run typecheck
bun test
```

## Key exports

- `EntityService`
- `EntityRegistry`
- `BaseEntityAdapter`
- `FallbackEntityAdapter`
- `EmbeddingJobHandler`
- `SingletonEntityService`
- `BaseEntity`, `EntityAdapter`, `SearchOptions`, `ListOptions`, `EntityEventBus`
- `parseMarkdownWithFrontmatter`, `generateMarkdownWithFrontmatter`, `generateFrontmatter`
- Entity and embedding database helpers

## License

AGPL-3.0-only
