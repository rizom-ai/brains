# Entity visibility implementation review follow-ups

## Status

Read-side follow-ups completed in earlier commits. Second-pass audit surfaced
three remaining gaps on the write/disclosure side. Each is tracked below.

## 1. Gate MCP prompts by permission

`MCPService.registerPrompt` and `registerEntriesOnServer` register prompts on
the protocol server unconditionally. Tools and resources are gated by
`canExposeTool` / `canExposeResource` at both initial registration and per-
session server creation — prompts are not. If a prompt body references
anchor-only workflows or restricted entity names, a public MCP session sees it.

Fix:

- Add optional `visibility?: ToolVisibility` to the `Prompt` interface
  (defaulting to `anchor` for safety, matching tools).
- Add `canExposePrompt(level, prompt)` next to the existing helpers.
- Gate both `registerPrompt` and the `registerEntriesOnServer` prompts loop
  the same way tools are gated.

Tests:

- Three permission levels × prompt with each visibility level — assert the
  prompt is/isn't present on the protocol server.
- Per-session server (`createMcpServer(public)`) does not expose anchor prompts.

## 2. Cap write-side entity visibility by user permission

Read enforcement is solid (scoped entityService Proxy). Writes are not bounded:
`system_create` and `system_update` accept any `visibility` value the user
supplies via frontmatter or `fields`, regardless of `context.userPermissionLevel`.

Concrete risk: a `trusted` user can author or edit an entity at
`visibility: "restricted"` (anchor-only). They cannot read what they wrote
afterwards, but the content lands in the anchor's view — an injection vector if
the anchor later reads the entity through an automated flow.

Rule: a user can only write entities at a visibility no more restrictive than
their own permission allows. Concretely, using `permissionToVisibilityScope`:

- `anchor` → may write `restricted` | `shared` | `public`
- `trusted` → may write `shared` | `public` (not `restricted`)
- `public` → may write `public` only

Fix:

- Add `assertVisibilityWritable(userLevel, requestedVisibility)` helper in
  `@brains/entity-service` (or `@brains/templates`), greppable.
- Apply in `entity-create-tool` after computing the effective visibility from
  markdown frontmatter / entity object.
- Apply in `entity-update-tool` to both the `content`-replacement path (visibility
  from frontmatter) and the `fields` path (visibility supplied directly).
- Return `{ success: false, error }` with a clear message naming the user's
  permission level and the requested visibility.

Tests:

- Trusted user creating an entity with frontmatter `visibility: restricted` is
  rejected.
- Public user updating fields with `visibility: shared` is rejected.
- Anchor user writing any visibility succeeds.
- Trusted user writing `shared` succeeds (boundary case).

## 3. Harden resolveContent saved-content fallback

`createScopedEntityService` only hooks `getEntity` / `search` if a
`visibilityScope` was supplied at proxy construction. The savedContent fallback
in `resolveContent` reaches the entityService via the scoped proxy passed by
the build context, so it is currently safe — but the Proxy's conditional makes
the guarantee implicit rather than explicit.

Fix:

- Drop the `if (visibilityScope)` guards inside the Proxy. Always normalize
  `getEntity` / `search` / `listEntities` / `countEntities` to the proxy's
  scope (which may be `undefined`, i.e. unrestricted — same as today's
  baseService passthrough). The intent is: if a scope is configured on this
  proxy, no caller can widen it.
- Confirm: when `publishedOnly` and `visibilityScope` are both undefined,
  `createScopedEntityService` still returns `baseService` (no Proxy). The
  hardening only affects proxies that exist _because_ something was scoped.

Tests:

- A datasource that calls `entityService.getEntity({...visibilityScope: "restricted"})`
  through a Proxy scoped to `"public"` receives only public entities — the
  datasource cannot widen.
- Existing tests for the scoped Proxy continue to pass.

## Validation

```bash
bun test shell/mcp-service/test/mcp-service.test.ts \
  shell/core/test/system/entity-mutation-tools.test.ts \
  shell/content-service/test/resolve-content.test.ts

bun run typecheck
bun run lint
```
