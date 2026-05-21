# Entity visibility implementation review follow-ups

## Status

Read-side follow-ups completed in earlier commits. Second-pass audit surfaced
three remaining gaps on the write/disclosure side:

- [x] Gate MCP prompts by permission (commit b0b0390c8)
- [x] Cap write-side entity visibility by user permission
- [ ] Harden resolveContent saved-content fallback (last open item)

## 1. Harden resolveContent saved-content fallback

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
  shell/core/test/system/write-tools-visibility.test.ts \
  shell/content-service/test/resolve-content.test.ts

bun run typecheck
bun run lint
```
