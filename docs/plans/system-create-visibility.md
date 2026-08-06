# Plan: First-class visibility for `system_create`

## Status

Implemented on `feat/system-create-visibility`; focused model-eval execution remains before closure. The typed command, confirmation, persistence, interceptor/upload propagation, deterministic coverage, and personal/team eval cases are in place. Tests, typechecks, lint, docs checks, and changeset validation pass. Eval execution is blocked locally because no AI API key is configured. Remove this plan after the focused evals pass and the implementation merges.

## Problem

The canonical entity model supports `public`, `shared`, and `restricted` visibility, and write-side permission checks already prevent callers from writing above their readable scope. `system_update` can change visibility through `fields.visibility`, but `system_create` has no typed visibility argument.

Today `system_create` can only infer non-public visibility from frontmatter inside `source.kind: "text"` content. That is not a valid agent command contract:

- the model is told that direct-save text is exact supplied material;
- adding policy frontmatter mutates that material;
- prior-response and upload paths do not offer a reliable equivalent;
- basic MCP deliberately hides raw write tools and routes commands through `chat`, so its inner agent has no typed way to express the requested visibility;
- team-note capture can therefore silently fall back to the default public visibility.

## Decisions

1. **Fix the canonical command, not the MCP exposure boundary.** Add visibility to `system_create`. Basic MCP remains read tools plus agent-backed `chat`/`confirm`; it does not expose raw writes.
2. **Use canonical values only.** The tool argument is `visibility?: "public" | "shared" | "restricted"`:
   - `public`: visible to every caller;
   - `shared`: visible to Trusted and Admin callers;
   - `restricted`: visible only to Admin callers.
3. **Keep omission stable.** An omitted value continues to create public content.
4. **Keep language mapping explicit.** Team/shared/collaborator requests use `shared`. Private/admin-only/restricted requests use `restricted`. The phrase “not public” alone is ambiguous and must not collapse the two non-public levels into one hidden rule.
5. **Keep policy separate from supplied content.** The model passes visibility as a sibling of `source`; it must not prepend visibility frontmatter to exact text merely to select access policy.
6. **Fail on conflicting policy declarations.** If an explicit tool argument and source frontmatter both declare different visibility values, reject the request rather than silently choosing one.
7. **Never silently publish an intercepted create.** Every `system_create` branch must either preserve explicit visibility through persistence or reject that visibility before side effects. Interceptors and upload-backed paths may not drop it and default to public.
8. **Preserve authorization.** `canWriteVisibility()` remains the enforcement rule: Public may write public, Trusted may write public/shared, and Admin may write all three levels.

## Implementation

### 1. Canonical schema and model instructions

- Add optional canonical `visibility` to `createInputSchema` in `shell/core`.
- Ensure the AI SDK model-visible schema keeps the field exposed.
- Add the same normalized field to the shared `CreateInput` contract used by create interceptors.
- Update the `system_create` description and system instructions with the three values and language mapping above.
- Do not add a compatibility alias or an MCP-only visibility field.

### 2. Confirmation integrity

- Resolve and authorize the effective visibility before returning a confirmation.
- Include visibility in the confirmation preview.
- Freeze it into confirmation arguments so the confirmed execution cannot lose or change the requested scope.
- Keep confirmation-token integrity checks authoritative over the complete argument set.

### 3. Persistence

- Pass visibility as a core entity field for direct creates, including adapter-validated Markdown creation.
- Preserve exact source content apart from the entity serializer’s existing canonical persistence behavior.
- Retain legacy source-frontmatter inference when no explicit argument is supplied.
- Detect and reject explicit/frontmatter conflicts.
- Audit create interceptors and upload-save handlers. Propagate visibility through paths that create entities or stubs; reject before side effects where a path cannot support it safely.
- Ensure asynchronous jobs preserve the stub’s visibility when replacing generated/imported content.

### 4. Deterministic tests

Add focused coverage for:

- `system_create` exposes canonical visibility to the model;
- omission still creates public content;
- Admin can create restricted content;
- Trusted can create shared content;
- Trusted cannot create restricted content;
- Public cannot create shared content;
- confirmation preview and replay arguments preserve visibility;
- explicit visibility persists on the created entity;
- exact note text is not rewritten by the model-facing command path;
- conflicting explicit and frontmatter visibility is rejected;
- intercepted/upload-backed creates never silently fall back to public;
- basic MCP still hides raw `system_create` while routing command text through the authorized agent context.

### 5. Behavioral evals

Add or tighten canonical brain evals:

1. **Admin private note:** “Save this as a private note …” must call `system_create` with `entityType: note`, `source.kind: text`, and `visibility: restricted`.
2. **Trusted team note:** tighten `team-permission-trusted-save-team-note` to require `visibility: shared`, then confirm successfully.
3. **Ordinary note:** retain the existing direct-note eval to guard the public default and exact text-source routing.
4. **Unauthorized private note:** retain the Public denial eval and add a Trusted→restricted denial case if the agent otherwise attempts escalation.
5. **Confirmation/readback:** use a focused multi-turn case where useful to confirm and retrieve the note at the intended scope without claiming completion before confirmation.

The evals should assert typed tool arguments with `argsContain`; prose-only success is insufficient. Because basic MCP uses the same agent entrypoint and model tool surface, agent routing evals plus MCP adapter/exposure tests cover the boundary without introducing a separate MCP-only command implementation.

## Validation

Run the lightest checks first:

```bash
bun test shell/core/test/system/write-tools-visibility.test.ts \
  shell/core/test/system/entity-create.test.ts \
  shell/ai-service/test/sdk-tools.test.ts \
  interfaces/mcp/test/mcp-tools.test.ts

bun run typecheck
bun run lint
```

Then run the focused note/permission eval cases for the canonical personal and team postures. Run broader core/team eval coverage only if tool-surface or instruction changes affect unrelated routing.

## Exit criteria

The work is complete when:

- an authorized agent can express `shared` or `restricted` directly in `system_create`;
- confirmation and every supported create path preserve that value;
- unsupported paths reject rather than publish accidentally;
- permission escalation remains blocked;
- basic MCP can complete the agent-backed flow without exposing raw writes;
- focused deterministic tests and behavioral evals pass;
- this plan is removed and the shipped behavior is captured in changelogs or implementation documentation.
