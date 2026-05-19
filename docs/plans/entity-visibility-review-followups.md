# Entity visibility implementation review follow-ups

## Status

Draft follow-up plan from review of `feat/entity-visibility-derived-scope` against `docs/plans/entity-visibility-and-derived-scope.md`.

## Goal

Close the remaining gaps before merging canonical entity visibility, especially around preventing non-public content from reaching public surfaces or broader derived entities.

## Must fix before merge

### 1. Make hydrated `BaseEntity.visibility` required

Problem: runtime code normalizes visibility, but the TypeScript interface still marks `BaseEntity.visibility` optional. The intended contract is: raw create/import/markdown inputs may omit visibility, while hydrated runtime/DB entities always carry normalized canonical visibility.

Relevant files:

- `shell/entity-service/src/types.ts`
- `shell/entity-service/src/entity-data.ts`
- entity/test fixtures that construct full `BaseEntity` values directly

Plan:

- Change `BaseEntity.visibility` to required.
- Change `EntityData.visibility` to required.
- Keep `EntityInput.visibility` optional and typed as `RawContentVisibility`.
- Keep adapter `fromMarkdown()`/deserialize flows partial so raw markdown can omit visibility.
- Ensure all hydrate/reconstruct paths normalize missing/legacy visibility to `"public"`.
- Preserve public base note round-trip: required runtime `visibility: "public"` must still serialize with no `visibility:` frontmatter.
- Update fixtures/tests to include `visibility: "public"` or use helpers that default it.

### 2. Keep topic merging within the target visibility boundary

Problem: topic extraction currently uses visibility _scope_ for merge candidates. A restricted extraction can merge into a public/shared topic and preserve that topic's broader visibility.

Relevant files:

- `entities/topics/src/lib/topic-batch-extractor.ts`
- `entities/topics/src/lib/topic-service.ts`

Plan:

- Add same-visibility candidate filtering for topic merge candidates.
- Ensure `applySynthesizedMerge()`/`updateTopic()` cannot broaden restricted/shared-derived content into public topics.
- Add tests for public, shared, and restricted extraction when matching topics already exist at other visibilities.

### 3. Prevent existing topic titles from leaking across visibility boundaries

Problem: `listExistingTopicTitles()` lists existing topic titles without visibility filtering and injects them into extraction prompts.

Relevant files:

- `entities/topics/src/lib/extraction-prompt.ts`
- `entities/topics/src/lib/topic-batch-extractor.ts`

Plan:

- Pass target visibility into the existing-title lookup.
- Prefer same-visibility existing topics for canonicalization guidance.
- Add tests proving public extraction does not see shared/restricted topic titles.

### 4. Scope topic rebuild and initial sync by visibility

Problem: `replaceAllTopics()` deletes all topics, and initial sync skips if any topic exists, regardless of configured extraction visibility.

Relevant files:

- `entities/topics/src/lib/topic-projection.ts`
- `entities/topics/src/index.ts`
- `shell/plugins/src/entity/derived-entity-projection.ts`

Plan:

- Rebuild only topics at the configured target visibility.
- Initial sync should check for persisted targets at the configured target visibility.
- Add tests for public rebuild preserving shared/restricted topics.

### 5. Filter public site generation by visibility

Problem: production site generation applies lifecycle filtering (`publishedOnly`) but not `visibilityScope: "public"`.

Relevant files:

- `shell/content-service/src/content-service.ts`
- `shared/site-engine/src/dynamic-route-generator.ts`
- `plugins/site-builder/src/lib/create-build-context.ts`

Plan:

- In production/public site contexts, apply both `publishedOnly: true` and `visibilityScope: "public"`.
- Ensure dynamic detail routes are generated only for public entities.
- Ensure datasource/detail lookups cannot fetch shared/restricted entities for public builds.
- Add tests for production site route generation and datasource filtering.

### 6. Prevent MCP entity resource visibility bypasses

Problem: `entity://{type}` and `entity://{type}/{id}` resources list/read raw entities without the visibility checks used by `system_get/list/search`.

Relevant files:

- `shell/core/src/system/resource-templates.ts`
- `shell/mcp-service/src/mcp-service.ts`
- `shell/mcp-service/src/mcp-registration.ts`

Plan:

- Either make entity resources anchor-only at the transport layer, or pass caller permission into resource handlers and apply visibility filtering.
- Avoid leaking entity existence through resource listing/completion.
- Add tests for public/trusted/anchor MCP resource access.

## Should fix before merge if scope allows

### 7. Clarify/default direct entity search visibility

Problem: direct `entityService.search()` with no `visibilityScope` returns all entities. System tools pass scope, but internal call sites such as AI content generation may not.

Relevant files:

- `shell/entity-service/src/entity-search.ts`
- `shell/core/src/datasources/ai-content-datasource.ts`

Plan:

- Audit direct `entityService.search()` callers.
- Pass explicit scopes for public/shared contexts.
- Decide whether service-level omission means anchor/internal-only or should default closed to public.

### 8. Guard public publishing against non-public entities

Problem: direct publishing can publish shared/restricted entities without checking visibility.

Relevant files:

- `plugins/content-pipeline/src/tools/publish.ts`
- `plugins/content-pipeline/src/tools/publish-content.ts`

Plan:

- Reject non-public entities for public publishing providers, or require providers to declare supported visibility boundaries.
- Add tests for shared/restricted publish rejection.

## Cleanup

### 9. Reduce new casts introduced during tests/mocks

Problem: the branch still adds a few casts in tests/mocks, despite the no-casts preference.

Relevant examples:

- `shell/entity-service/test/entity-visibility.test.ts`
- `shell/core/test/system/read-tools-visibility.test.ts`
- `shared/test-utils/src/mock-mcp-service.ts`

Plan:

- Replace response-shape casts with typed helper functions or assertions.
- Replace invalid DB test cast with a lower-level SQL insert or a dedicated typed test helper.
- Keep unavoidable framework boundary casts out of production code.

## Validation

After fixes, run:

```bash
bun test shell/entity-service/test/entity-visibility.test.ts \
  shell/core/test/system/read-tools-visibility.test.ts \
  shell/core/test/system/register.test.ts \
  entities/topics/test/lib/topic-projection.test.ts \
  entities/topics/test/lib/topic-batch-extractor.test.ts \
  entities/topics/test/lib/topic-service.test.ts

bun run typecheck
bun run lint
```

Add targeted site-builder/MCP/content-pipeline tests as the corresponding fixes land.
