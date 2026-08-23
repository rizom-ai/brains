# Plan: MCP 2026-07-28 spec migration

## Status

**Complete — Phases 0–4 are implemented on `work/mcp-v2`.** Revised 2026-08-23 after completing the stateless SDK v2 transport and additive CIMD authorization support. Dynamic Client Registration remains available only for its compatibility deprecation window; its eventual removal is a separate follow-up gated on known client adoption.

## Verified landscape (2026-08-21)

### SDK v2 is on npm, under new package names

The v2 line does not ship as `@modelcontextprotocol/sdk@2`. The monolith was split: `@modelcontextprotocol/sdk` stays on the v1 line at 1.30.0 (`latest`, no v2 dist-tag, no publishes since 2026-07-27), and v2 ships as separate scoped packages, all at `latest: 2.0.0` since 2026-07-27:

- `@modelcontextprotocol/core`, `/server`, `/client`, `/node`
- adapters: `/express`, `/fastify`, `/hono`
- `/codemod` — automated v1→v2 migration, use it to open Phase 3

The published README states "**v2 is the stable release line**". The GitHub release note for the same tag still calls it "first beta release of SDK v2"; the npm `latest` tag and the shipped README are the operative signal. No patch releases in the three-and-a-half weeks since 2.0.0.

`@modelcontextprotocol/server-legacy@2.0.0` is **not** what we need for legacy clients — it is a frozen copy of the v1 SSE transport and OAuth authorization-server helpers, both unused here, and is slated for removal in v3. Do not reach for it.

### Dual-mode is the v2 default, not work we do

`createMcpHandler(factory)` from `@modelcontextprotocol/server` defaults to `legacy: 'stateless'`, which serves both 2026-07-28 and 2025-era traffic per request from a single factory. The only other value is `legacy: 'reject'` (modern-only). There is no session-preserving option in v2 at all — legacy clients are served statelessly, with no session ids and no session maps.

This is the single biggest correction to the original plan: supporting older clients is not a compatibility mode we build and carry, it is the default behavior, and it does not stand between us and the session deletion in Phase 3.

Authorization is era-independent. The handler verifies nothing itself: the bearer is validated _in front of_ the handler and passed in as `handler.fetch(request, { authInfo })`; the factory destructures `authInfo` to build the instance around one caller, and tool handlers read `ctx.http.authInfo`. Era detection happens after authentication, so the legacy path is not a second auth surface. The 2026-07-28 authorization requirements (RFC 9207 `iss` validation, SEP-2352 credential isolation, SEP-2350 scope step-up, SEP-837/SEP-2207 DCR + TLS) are implemented as SDK-level opt-ins that "apply on every era once enabled", not as protocol-era gates.

### Claude Code speaks 2026-07-28 as of 2.1.221 (2026-08-03)

Verified by inspecting the shipped `linux-x64` binaries, because the changelog never mentions it:

- **2.1.220** (2026-07-24) — zero occurrences of `2026-07-28`.
- **2.1.221** (2026-08-03) through **2.1.238** (2026-08-20) — 25 occurrences, and a full v2-era client: the `_meta` envelope (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientInfo`), a discover probe that falls back on malformed or mismatched replies with "treating the server as pre-2026-07-28", version-negotiation modes (`legacy`, revision pinning), `subscriptions/listen`, and `input_required` embedded requests.
- The legacy handshake path is retained alongside it: `SUPPORTED_PROTOCOL_VERSIONS` is still `["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]`.

npm dist-tags at time of writing: `stable` 2.1.228, `latest` 2.1.238. **This machine is on 2.1.220** — one release below the cutover.

The original plan's claim that "Claude Code's changelog shows no 2026-07-28 adoption" was true of the changelog and false of the product; adoption had already shipped six days before the plan was written.

### Claude Desktop and claude.ai connectors: unverified

Anthropic's announcement says only that "support is rolling out across Claude products soon" and names no individual product. Claude Desktop is macOS/Windows-only and not installable on this machine, so no empirical check was possible; there is no published compatibility matrix. `rizom-ai` is wired in as a claude.ai connector, which makes claude.ai's fetcher a live client of this server at an unknown negotiated revision.

This is why the default legacy path stays on. It is not a debt we owe — it is free, and two of our real clients are unmeasured.

## Goal

Adopt the MCP 2026-07-28 specification revision (stateless protocol core) with zero client breakage, on this timeline:

- **done** — pick up the 1.30.0 maintenance/security release;
- **done** — complete the v1-compatible registration and protocol-test modernization;
- **done** — swap to the v2 packages, keep the default `legacy: 'stateless'` handler, and delete obsolete session machinery;
- **done** — add CIMD (Client ID Metadata Documents) support alongside deprecated Dynamic Client Registration.

## Baseline before migration

- SDK `^1.30.0` in five package.json files: root, `shell/mcp-service`, `interfaces/mcp`, `plugins/unified-inbox`, and `packages/brain-cli` (publishes as `@rizom/brain`). The original plan listed four and missed `plugins/unified-inbox`.
- `interfaces/mcp/src/transports/http-server.ts` runs a stateful `WebStandardStreamableHTTPServerTransport`: `sessionIdGenerator`, `isInitializeRequest` gating, three in-memory session maps, session-principal pinning, and an idle-eviction supervisor (`session-eviction-supervisor.ts`). Per-session `McpServer` instances are built per permission level at session-init time.
- `shell/mcp-service/src/mcp-registration.ts` uses the legacy overloads at three call sites — `server.tool` (:200), `server.resource` (:302), `server.prompt` (:367) — and the modern `server.registerResource` at one (:340).
- `interfaces/mcp/test/transports/http-server.test.ts` hardcodes `protocolVersion: "2024-11-05"` in eight initialize bodies.
- `packages/brain-cli/src/lib/mcp-client.ts:31` carries a `@ts-expect-error` on the SDK's `StreamableHTTPClientTransport.sessionId` types vs `exactOptionalPropertyTypes`.
- `shell/auth-service` implements Dynamic Client Registration (`/register`, advertised via `registration_endpoint`).
- Known latent bug: `mcp-service.ts` rebuilds the `McpServer` on `setPermissionLevel` / `setAnchorStatus` / `setProtocolMode` / `unregisterPlugin`, but already-connected sessions keep the old server instance, so live clients never see the change. Statelessness dissolves this by construction.
- Not used anywhere, so the spec's deprecations cost nothing: legacy HTTP+SSE transport, Roots, Sampling, SDK logging, `listChanged` notifications.
- No `work/mcp-v2` worktree or MCP branch exists yet; Phases 1–2 have not started.

## Phases

### Phase 0 — SDK 1.30.0 bump — **shipped**

`@modelcontextprotocol/sdk` is at `^1.30.0` across all five package.json files. 1.30.0 was a v1 maintenance release (Zod validation fixes, SSE keep-alive lifecycle, Content-Type parsing, security-advisory dependency updates) with no API changes.

### Phase 1 — modern registration API — **complete**

In `mcp-registration.ts`, migrate the three legacy overloads to `registerTool` / `registerResource` / `registerPrompt`, which survive into SDK v2. Tests first: extend `shell/mcp-service/test/mcp-service.test.ts` (which already exercises registration through `Client` + `InMemoryTransport`) to pin tool/resource/prompt behavior — annotations derived from `sideEffects`, `_meta` forwarding, prompt argument schemas — then swap the implementation under the green suite. No behavior change; releasable immediately.

### Phase 2 — protocol-version hygiene in tests — **complete**

Replace the eight hardcoded `"2024-11-05"` strings in `http-server.test.ts` with the SDK's `LATEST_PROTOCOL_VERSION` constant, and centralize the raw initialize-request body in one test helper so the Phase 3 change touches one place instead of eight. Releasable immediately.

### Phase 3 — v2 packages, stateless core — **complete**

No longer gated on anything external. Run `@modelcontextprotocol/codemod` first to mechanize the bulk of the v1→v2 rename, then:

- Replace `@modelcontextprotocol/sdk` with the v2 packages across the five manifests: `@modelcontextprotocol/server` for `shell/mcp-service` and `interfaces/mcp`, `@modelcontextprotocol/client` for `packages/brain-cli` and `plugins/unified-inbox`, `@modelcontextprotocol/node` where a Node-specific transport is needed. Follow `docs/migration/upgrade-to-v2.md` and `docs/migration/support-2026-07-28.md`.
- Serve via `createMcpHandler(factory)` and **leave `legacy` at its default `'stateless'`**. This is a deliberate non-action, not a compatibility layer to build — see Decisions.
- Delete the session machinery the stateless path obsoletes: the three session maps, `session-eviction-supervisor.ts`, `sessionIdleTtlMs` config, and session-principal pinning. Per-request `authInfo` replaces pinning. This deletion is unconditional — it does not trade off against legacy support, because the legacy path is stateless too.
- Move permission-scoped server selection from session-init time to request time: resolve the authenticated principal's permission level per request and dispatch to a per-level `McpServer` (cached by level, invalidated on registry mutation). This deletes the stale-server-on-mutation bug rather than fixing it.
- Wire auth as v2 expects: verify the bearer in front of the handler and pass `handler.fetch(request, { authInfo })`; read `ctx.http.authInfo` in tool handlers.
- Set `ttlMs`/`cacheScope` on `tools/list`, `prompts/list`, `resources/list` results. Because tool visibility is permission-scoped, use `cacheScope` that keys on the authenticated principal and a short TTL (60s) so permission changes propagate within a minute.
- Remove the `@ts-expect-error` in `brain-cli/src/lib/mcp-client.ts:31` if the v2 types resolve the `exactOptionalPropertyTypes` conflict.
- Tests: cover both eras — stateless 2026-07-28 request/response paths, 2025-era traffic through the default legacy path, per-request permission resolution, and 403 on scope mismatch. Assert that a legacy request with no valid bearer is rejected before reaching the factory, so the era-independence of auth is pinned rather than assumed.

Release gate: green tests. There is no client-adoption gate.

### Phase 4 — CIMD in auth-service — **complete**

`shell/auth-service` now advertises and resolves HTTPS Client ID Metadata Documents alongside the existing DCR `/register` endpoint. Resolution validates exact client IDs and redirect URIs, honors HTTP caching, limits response size, and rejects SSRF-prone destinations and redirects. Explicit `application_type` values enforce native/web redirect constraints. DCR credentials are issuer-bound while CIMD identifiers remain portable. DCR stays available through the deprecation window and will be removed separately once known clients (Claude Code/Desktop, brain-cli) no longer need it.

## Decisions made

- **Keep `legacy: 'stateless'`, because there is nothing to drop.** The original plan framed dual-mode as a design decision with a cost and gated release on Anthropic clients adopting the new revision. Both were wrong. Legacy support is the SDK default, is served statelessly per request from the same factory, shares the same `authInfo` flow, and costs zero lines. Choosing `legacy: 'reject'` would mean _adding_ a line to break unmeasured clients — including this machine's own Claude Code 2.1.220 — for no reduction in code we maintain. Revisit only if the legacy path ever acquires real cost.
- **The session deletion is unconditional.** It was never in tension with legacy support; v2 has no stateful mode for either era. The three session maps, the eviction supervisor, and principal pinning go regardless.
- **Prep work happens now on v1.** Phases 1–2 are pure v1 API usage, releasable independently, and cut the Phase 3 diff to package swap + session deletion.
- **`server-legacy` is not part of this.** It is the frozen v1 SSE transport and OAuth AS helpers; both are unused here and it is slated for removal in v3.
- **Treat v2 as stable.** npm `latest` is 2.0.0 and the shipped README calls v2 the stable release line, against a GitHub release note that still says "beta". If a regression surfaces, the v1 line remains at `@modelcontextprotocol/sdk@1.30.0` and the rollback is a manifest revert plus the Phase 1–2 work, which is v1-compatible by construction.
- **CIMD is additive first.** DCR removal is a separate step gated on client reality, not bundled into Phase 4.

## Open verification

Claude Desktop's and claude.ai's negotiated revision are unmeasured. Neither blocks any phase — the default legacy path covers them either way — but if we ever reconsider `legacy: 'reject'`, measuring them is the prerequisite. The cheapest measurement is to log the negotiated era per request once Phase 3 lands, and read it off real connector traffic.
