# Entity visibility implementation review follow-ups

## Status

Open follow-ups for `feat/entity-visibility-derived-scope` against `docs/plans/entity-visibility-and-derived-scope.md`. Completed items have been pruned.

## Goal

Close the remaining gaps before merging canonical entity visibility, especially around preventing non-public content from reaching public surfaces or broader derived entities.

## Must fix before merge

### 1. Filter public site generation by visibility

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

### 2. Prevent MCP entity resource visibility bypasses

Problem: `entity://{type}` and `entity://{type}/{id}` resources list/read raw entities. The default-public chokepoint fix in entity-service prevents content leak, but resource listing/completion may still leak existence of non-public entities.

Relevant files:

- `shell/core/src/system/resource-templates.ts`
- `shell/mcp-service/src/mcp-service.ts`
- `shell/mcp-service/src/mcp-registration.ts`

Plan:

- Either make entity resources anchor-only at the transport layer, or pass caller permission into resource handlers and apply visibility filtering.
- Avoid leaking entity existence through resource listing/completion.
- Add tests for public/trusted/anchor MCP resource access.

## Should fix before merge if scope allows

## Validation

After fixes, run:

```bash
bun test shell/entity-service/test/entity-visibility.test.ts \
  shell/core/test/system/read-tools-visibility.test.ts \
  shell/core/test/system/register.test.ts \
  entities/topics/test/lib/topic-projection.test.ts \
  entities/topics/test/lib/topic-batch-extractor.test.ts \
  entities/topics/test/lib/topic-service.test.ts \
  entities/agent-discovery/test/skill-deriver.test.ts

bun run typecheck
bun run lint
```

Add targeted site-builder/MCP/content-pipeline tests as the corresponding fixes land.
