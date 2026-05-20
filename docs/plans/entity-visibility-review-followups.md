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

### 3. `outputVisibility` is a scope, not an exact partition

Problem: `reconcileDerivedEntities` reads existing targets with `visibilityScope: outputVisibility`, which returns entities at-or-below that level. A `shared` projection sees public + shared targets and can treat public entries as its own — claiming them as "existing", deleting them as stale, or rewriting their visibility on update.

Relevant files:

- `shell/plugins/src/entity/derived-entity-projection.ts`

Plan:

- After listing at scope, filter to entities whose `visibility === outputVisibility` so each projection operates only on its own partition.
- Same fix applies to `hasPersistedTargets` when `options.outputVisibility` is set.
- Add tests for `outputVisibility: "shared"` reconciler ignoring public targets at the same ID.

### 5. Conversation memory non-public mode is incomplete

Problem: `summary-projector.ts` existing-summary lookup and decision/action-item cleanup don't pass `memoryVisibility`. With `memoryVisibility: "shared"` or `"restricted"`, existing summaries become invisible, causing repeated regeneration and stale child memory persisting.

Relevant files:

- `entities/conversation-memory/src/lib/summary-projector.ts`

Plan:

- Pass `memoryVisibility` to all summary lookups and to child-memory listing/cleanup.
- Add tests for shared/restricted memory mode persistence and cleanup.

### 6. Directory sync silently public-only

Problem: `sync/export/cleanup` listing paths don't pass `visibilityScope`, so they default to public. With non-public entities present, sync misses them entirely.

Relevant files:

- `plugins/directory-sync/src/lib/import-persistence.ts`
- `plugins/directory-sync/src/lib/export-pipeline.ts`
- `plugins/directory-sync/src/lib/cleanup-pipeline.ts`

Plan:

- Opt up via `internalFullScope("...")` at each pipeline's entity-listing callsite — sync is system-internal indexing, no user surface.
- Add tests proving non-public entities reach the sync pipeline.

### 7. System mutation/extract tools still need caller scope

Problem: `entity-cover-tool.ts` and `entity-extract-tool.ts` resolve entities without passing the caller's permission level. Trusted/anchor callers can't operate on non-public entities through these tools.

Relevant files:

- `shell/core/src/system/entity-cover-tool.ts`
- `shell/core/src/system/entity-extract-tool.ts`

Plan:

- Apply the same `permissionToVisibilityScope(context.userPermissionLevel)` pattern used by system_get/update/delete.

## Should fix before merge if scope allows

### 9. Make skill derivation visibility explicit

Problem: skills are derived from topics, so unrestricted skill derivation can leak restricted topic evidence into public skill/capability surfaces.

Relevant files:

- `entities/agent-discovery/src/*skill*`
- `entities/agent-discovery/test/*skill*`
- topic-to-skill derivation callers/configuration, if separate from agent discovery

Plan:

- Add or document a skill derivation target visibility, defaulting to `public`.
- Skill derivation should read only topics visible within the configured threshold, and should write/merge/delete only skills at the target visibility partition.
- A skill must never be more public than the topics used to derive it.
- Public skill derivation reads public topics and writes public skills; restricted skill derivation may read public + shared + restricted topics but writes restricted skills.
- Add tests proving public skill derivation excludes shared/restricted topics and does not merge into shared/restricted skill partitions.

### 10. Make A2A/public capability exposure visibility-scoped

Problem: A2A and remote-agent capability surfaces can expose derived skills/topics. If those surfaces list all skills/topics, restricted derived knowledge can leak through capability descriptions or resource/tool results.

Relevant files:

- `shell/core/src/system/*`
- `shell/mcp-service/src/*`
- A2A agent/card/capability registration code
- skill/topic datasource code used by remote-agent capability surfaces

Plan:

- Default unauthenticated A2A/remote-agent callers to public visibility scope.
- Expose only public topics/skills in public A2A agent identity/capability surfaces.
- Map future trusted remote agents to shared visibility scope only through explicit trust/auth configuration.
- Ensure A2A tools/resources reuse the same visibility enforcement as system read tools and MCP resources.
- Add tests proving public A2A/capability listings exclude shared/restricted skills and topics.

## Cleanup

### 11. Reduce new casts introduced during tests/mocks

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
  entities/topics/test/lib/topic-service.test.ts \
  entities/agent-discovery/test/skill-deriver.test.ts

bun run typecheck
bun run lint
```

Add targeted site-builder/MCP/content-pipeline tests as the corresponding fixes land.
