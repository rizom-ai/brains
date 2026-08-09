# Plan: MCP 2026-07-28 spec migration

## Status

**Proposed — created 2026-08-09.** Phase 0 (SDK 1.30.0 bump) ships to `main` immediately. Phases 1–2 are v1-compatible preparation and run in the `work/mcp-v2` worktree (`~/Documents/brains-worktrees/mcp-v2`); they are releasable at any time. Phase 3 is blocked on `@modelcontextprotocol/sdk` v2 reaching npm (v2 exists only as a GitHub beta today; npm `latest` is 1.30.0 with no beta dist-tag). Phase 4 has a 12-month deprecation runway.

## Goal

Adopt the MCP 2026-07-28 specification revision (stateless protocol core) with zero client breakage, on this timeline:

- **now** — pick up the 1.30.0 maintenance/security release;
- **continuously** — shrink the eventual v2 diff with v1-compatible modernization so the v2 swap is small and releasable as soon as the SDK stabilizes;
- **on SDK v2 stable** — swap to v2 in dual-mode (stateless + legacy initialize handshake), because Claude Code and Claude Desktop still negotiate 2025-11-25 and a stateless-only server would break against them;
- **within the deprecation window** — add CIMD (Client ID Metadata Documents) support to auth-service alongside the now-deprecated Dynamic Client Registration.

## Current baseline

- SDK `^1.29.0` in root, `shell/mcp-service`, `interfaces/mcp`, `packages/brain-cli` (publishes as `@rizom/brain`).
- `interfaces/mcp/src/transports/http-server.ts` runs a stateful `WebStandardStreamableHTTPServerTransport`: `sessionIdGenerator`, `isInitializeRequest` gating, three in-memory session maps, session-principal pinning, and an idle-eviction supervisor (`session-eviction-supervisor.ts`). Per-session `McpServer` instances are built per permission level at session-init time.
- `shell/mcp-service/src/mcp-registration.ts` uses the legacy `server.tool(...)`, `server.resource(...)`, `server.prompt(...)` overloads; only one call site uses the modern `registerResource` API.
- `interfaces/mcp/test/transports/http-server.test.ts` hardcodes `protocolVersion: "2024-11-05"` in eight initialize bodies.
- `packages/brain-cli/src/lib/mcp-client.ts` carries a `@ts-expect-error` on `client.connect(transport)` (SDK types vs `exactOptionalPropertyTypes`).
- `shell/auth-service` implements Dynamic Client Registration (`/register`, advertised via `registration_endpoint`).
- Known latent bug: `mcp-service.ts` rebuilds the `McpServer` on `setPermissionLevel` / `setAnchorStatus` / `setProtocolMode` / `unregisterPlugin`, but already-connected sessions keep the old server instance, so live clients never see the change. Statelessness dissolves this by construction.
- Not used anywhere, so the spec's deprecations cost nothing: legacy HTTP+SSE transport, Roots, Sampling, SDK logging, `listChanged` notifications.

## Phases

### Phase 0 — SDK 1.30.0 bump (main, now)

Bump `@modelcontextprotocol/sdk` to `^1.30.0` in all four package.json files. 1.30.0 is a v1 maintenance release (Zod validation fixes, SSE keep-alive lifecycle, Content-Type parsing, security-advisory dependency updates) with no API changes. Run the mcp-service, mcp, and brain-cli test suites; changeset (`@rizom/brain` patch); push main so the release train publishes.

### Phase 1 — modern registration API (worktree, v1-compatible)

In `mcp-registration.ts`, migrate the legacy overloads to `registerTool` / `registerResource` / `registerPrompt`, which survive into SDK v2. Tests first: extend `shell/mcp-service/test/mcp-service.test.ts` (which already exercises registration through `Client` + `InMemoryTransport`) to pin tool/resource/prompt behavior — annotations derived from `sideEffects`, `_meta` forwarding, prompt argument schemas — then swap the implementation under the green suite. No behavior change; releasable immediately.

### Phase 2 — protocol-version hygiene in tests (worktree, v1-compatible)

Replace the eight hardcoded `"2024-11-05"` strings in `http-server.test.ts` with the SDK's `LATEST_PROTOCOL_VERSION` constant, and centralize the raw initialize-request body in one test helper so the v2 dual-mode change touches one place instead of eight. Releasable immediately.

### Phase 3 — SDK v2 swap, stateless core (worktree, blocked on npm release)

Trigger: `@modelcontextprotocol/sdk` v2 published to npm as stable.

- Bump to v2 and run the v1→v2 migration notes shipped with the SDK.
- Configure the transport in **dual-mode**: accept self-describing 2026-07-28 requests (protocol version, client info, capabilities in `_meta`) and fall back to the legacy initialize handshake. Do not ship stateless-only until Claude Code and Claude Desktop demonstrably negotiate 2026-07-28.
- Delete the session machinery the stateless path obsoletes: the three session maps, `session-eviction-supervisor.ts`, `sessionIdleTtlMs` config, and session-principal pinning (each request now carries its own bearer; per-request auth replaces pinning).
- Move permission-scoped server selection from session-init time to request time: resolve the authenticated principal's permission level per request and dispatch to a per-level `McpServer` (cached by level, invalidated on registry mutation). This deletes the stale-server-on-mutation bug rather than fixing it.
- Set `ttlMs`/`cacheScope` on `tools/list`, `prompts/list`, `resources/list` results. Because tool visibility is permission-scoped, use `cacheScope` that keys on the authenticated principal and a short TTL (60s) so permission changes propagate within a minute.
- Remove the `@ts-expect-error` in `brain-cli/src/lib/mcp-client.ts` when the v2 types fix the `exactOptionalPropertyTypes` conflict.
- Tests: rewrite the transport suite around both modes — stateless request/response paths, legacy-handshake fallback, per-request permission resolution, 403 on scope mismatch.

Release gate: dual-mode makes this safe to release as soon as it is green; it does not wait for Anthropic clients to adopt the new revision.

### Phase 4 — CIMD in auth-service (independent, within 12 months of 2026-07-28)

Add Client ID Metadata Document support to `shell/auth-service` alongside the existing DCR `/register` endpoint: accept `client_id` values that are HTTPS URLs, fetch and validate the metadata document, honor the new `application_type` parameter, and enforce issuer-bound credentials (no cross-server reuse). Keep DCR working through the deprecation window, then remove it in a follow-up once known clients (Claude Code/Desktop, brain-cli) no longer register dynamically. Tests first against the auth-service suite.

## Decisions made

- **Dual-mode, not stateless-only, at v2 swap time.** Claude Desktop negotiates 2025-11-25 and Claude Code's changelog shows no 2026-07-28 adoption; a stateless-only server breaks both. Revisit removal of the handshake path only after Anthropic clients ship the new revision.
- **Prep work happens now on v1.** Phases 1–2 are pure v1 API usage, releasable independently, and cut the v2 diff to transport + session deletion. Waiting for v2 stable to start would serialize everything behind an external timeline.
- **Session eviction and pinning are deleted, not ported.** They exist only to manage state the new protocol removes. Per-request bearer auth supersedes session-principal pinning.
- **CIMD is additive first.** DCR removal is a separate step gated on client reality, not bundled into Phase 4.
