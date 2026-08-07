# Plan: HTTP route registry hardening

## Status

**Proposed.** This is correctness, security, and maintainability work for the shared HTTP surface. No live vulnerability or collision exists today: the only first-party API route is intentionally public, and no current composition declares a duplicate method/path pair.

Sequencing against `0.2.0` runs the other way from a release gate. Every package sits on the `0.2.0-alpha` line, and the [public authoring API plan](./public-authoring-api-0.2.md) excludes alpha signatures from the compatibility window — route-contract changes are free now and frozen once `0.2.0` stable ships. The contract surface of Phases 1–3 (the `security` field and `context.http.register()`) should therefore land before stable; enforcement internals and compiled matching can follow at any time.

Phase 1 can proceed independently. Central operator authorization should align with the shipped [`auth-service` boundary](../../shell/auth-service/README.md), which owns the multi-user and permission model; this plan must not create a second user or identity system.

## Goal

Make every runtime HTTP route part of one deterministic, inspectable, lifecycle-owned route table with:

- explicit ownership;
- startup-time conflict detection;
- consistent authorization semantics;
- one dispatch pipeline for handler-backed and tool-backed routes;
- stable compatibility for existing first-party and external plugins;
- explicit production/preview exposure; and
- route-backed endpoint advertising that cannot silently drift.

The shared webserver remains the canonical HTTP listener.

## Current baseline

HTTP behavior is distributed across five related mechanisms:

1. Service and interface plugins expose `getWebRoutes()` and, for services, `getApiRoutes()`. Collection is duck-typed (`"getApiRoutes" in plugin`), so the service-only scope of API routes is convention, not an enforced contract.
2. `shell/core/src/plugin-routes.ts` asks every plugin for those arrays. Web routes keep their absolute path; API routes receive `/api/{pluginId}` prefixes.
3. `interfaces/webserver/src/server-manager.ts` asks for the arrays during each request and resolves web routes in two tiers: exact method/path match first, then `match: "prefix"` routes sorted longest-path-first (CMS depends on the prefix tier for `/cms/entities` and `/cms/workspaces`). API dispatch is exact-only.
4. Plugins separately call `context.endpoints.register()` to advertise important URLs through `appInfo` and Dashboard: webserver's own Site and Preview, Chat, A2A, MCP, CMS, Admin, Account, and Dashboard.
5. `deriveConsoleSurfaces(...)` re-reads the live web-route list to build console navigation in dashboard, CMS, admin, account, and web-chat — a second consumer of the route getters beyond dispatch.

The shared server also owns `/health*`, `/images/*`, static files, clean URLs, and production-versus-preview host selection outside the plugin route collectors. The `/images/*` fast path and `/health*` force-routing run in the `Bun.serve` fetch before any Hono app, so they preempt plugin routes in those namespaces even on preview hosts, and `/.site-build-manifest.json` is unconditionally 404'd.

This baseline has useful properties: route behavior remains plugin-owned, the webserver is in-process, tool routes reuse tool execution, and static output needs no controller registration. The hardening work should preserve those properties.

## Problems to solve

### Silent conflicts

Two plugins can declare the same method/path. Collection preserves plugin iteration order and dispatch uses the first match, so one route silently shadows the other. No composition collides today, but namespace pressure is real: auth-service declares many bare top-level paths (`/login`, `/logout`, `/setup`, `/authorize`, `/register`, `/token`, `/revoke`, `/webauthn/*`, parts of `/.well-known/*`), dashboard mounts at `/` in core-only compositions, CMS owns `/cms`, and MCP owns `/status`. Registration order is the only tiebreaker — which also means adding detection now is a non-breaking change.

### Ambiguous authorization

`WebRouteDefinition.public` currently controls whether the shared server will invoke a handler; it does not describe the route's actual security protocol. Consequently, operator-gated CMS and web-chat routes declare `public: true` and enforce sessions inside handlers. MCP, A2A, OAuth, and webhooks also declare `public: true` while implementing protocol-specific authentication themselves.

`ApiRouteDefinition.public` is present in the contract (defaulting to `false`) but is never read by shared-host API dispatch, so any future private tool route is fail-open by default. The only current first-party API route is intentionally public. Tool execution also receives no request principal at all: the invocation omits `userPermissionLevel` and `isAnchor` rather than passing an explicit anonymous level.

### Pull-based route discovery

The webserver repeatedly calls plugin route getters through the shell. This makes route ownership less explicit, prevents a stable manifest, repeats allocation/work per request, and leaves no natural registration handle for plugin unload. Console navigation (`deriveConsoleSurfaces`) is a second live consumer of the getters, so the registry must serve navigation as well as dispatch.

### Split dispatch behavior

Handler-backed web routes and tool-backed API routes have different contracts and security behavior even though both become method/path entries on the same host.

### String-comparison routing

The dispatcher compares raw strings (exact, then longest-prefix). There is no explicit path-parameter contract, route-specific middleware, compiled matcher, or path normalization: `GET /cms/` misses the exact `/cms` route and falls through to static serving. Existing APIs therefore lean on query parameters and fixed endpoint names. A matched API route also degrades silently into a static 404 when the message bus is absent instead of failing loudly.

### Endpoint-advertisement drift

The endpoint registry is intentionally broader than routes because Site and Preview may be external/static URLs. However, route-backed entries such as Dashboard, Chat, CMS, MCP, and A2A are declared twice and can drift.

### Implicit preview policy

Dynamic-route dispatch is coupled to the `healthEndpoint` option. Preview currently receives static output only, but that policy is not represented directly.

### Transitional server paths

The standalone `ApiServer` and standalone MCP HTTP listener remain in source even though production composition uses the shared webserver. The consumer audit is complete: `ApiServer`'s only consumer outside its own package is its own test, the `apiPort` config option is referenced nowhere, and the standalone MCP `start()` path is test-only (production MCP hard-errors when the shared webserver is absent). They are dead code that multiplies the HTTP architectures maintainers must understand, and the alpha line permits removing them without a deprecation period.

## Non-goals

- Replacing Hono or `Bun.serve`.
- Moving static site routes into the runtime route registry.
- Turning every existing query-parameter API into REST-style path parameters.
- Changing MCP, A2A, OAuth, WebAuthn, or webhook protocol semantics.
- Generating OpenAPI for arbitrary handler routes in the first implementation.
- Introducing another network listener.
- Making preview expose operator or protocol routes by default.
- Breaking the published `getWebRoutes()` or `getApiRoutes()` plugin contracts after `0.2.0` stable ships. Before stable, contract changes are permitted under the alpha policy; the legacy getters persist as a documented migration path, not a compatibility obligation.

## Architecture decisions

### 1. Keep one shared HTTP host

`@brains/webserver` remains the listener and static-file host. The shell owns route composition; plugins own handlers. No plugin should open its own production HTTP port.

### 2. Add one normalized internal route model

Keep the public route contracts initially, but normalize both into an internal shape before dispatch:

```ts
type RegisteredHttpRoute = {
  ownerPluginId: string;
  kind: "handler" | "tool";
  method: WebRouteMethod;
  fullPath: string;
  match: "exact" | "prefix";
  security: HttpRouteSecurity;
  handler: (request: Request, context: HttpRequestContext) => Promise<Response>;
  advertise?: HttpRouteAdvertisement;
};
```

Tool routes receive an adapter that parses the request, invokes the tool through the message bus, and creates the response. The normalized table is the only input consumed by `ServerManager`, and it preserves the existing exact-then-longest-prefix resolution.

Normalization must resolve the current contract asymmetries explicitly: web routes default to `GET` (today applied at dispatch time, unvalidated), API routes default to `POST` via Zod, and `OPTIONS` is only legal on web routes. The tool adapter must preserve the existing tool-name resolution rule — a `tool` string containing `_` is used verbatim, otherwise it is prefixed `{pluginId}_` — which the newsletter route depends on. A tool route dispatched without a message bus becomes a loud `500`, not a fall-through to static serving.

### 3. Make route security explicit

A boolean cannot represent public content, operator sessions, OAuth endpoints, signed A2A, MCP bearer tokens, and webhook verification. Use a tagged contract:

```ts
type HttpRouteSecurity =
  | { kind: "none" }
  | {
      kind: "operator";
      minimumLevel: "public" | "trusted" | "admin";
      requireAnchor?: boolean;
      csrf?: "required" | "not-required";
    }
  | { kind: "protocol" };
```

Semantics:

- `none`: no transport-level authentication is required.
- `operator`: the shared host resolves an authenticated runtime principal and enforces the minimum level before invoking the handler. `minimumLevel: "public"` still requires an authenticated principal (`401` when absent) but sets no level floor — that requirement is what distinguishes it from `none`. `requireAnchor` gates on `AuthPrincipal.isAnchor`, which is orthogonal to permission level (Admin does not imply Anchor); there is no "anchor" permission level.
- `protocol`: MCP, A2A, OAuth/WebAuthn, or a webhook adapter owns authentication because generic operator-session handling is not the protocol.

CSRF defaults fail safe: for `operator` routes using cookie authentication on unsafe methods, an unset `csrf` means `required`; `"not-required"` is an explicit opt-out.

During compatibility migration, routes without `security` retain their exact current `public` behavior. Do not infer that `public: true` means `security: { kind: "none" }`.

The resolver already exists: `AuthService.resolveSession(request)` returns an `AuthPrincipal`, with `resolveBearerGrant(request)` for token auth. The webserver consumes it through a small injected interface and must not grow a separate user store or infer users from cookies itself.

### 4. Fail closed on conflicts

The route registry rejects duplicate `(method, fullPath)` keys with an error naming both owners, including an exact route that duplicates another route's prefix root. It rejects non-absolute and non-canonical paths — one canonical form: no trailing slash, no percent-encoded segments, case-sensitive — and plugin routes in the webserver-owned namespaces `/health*`, `/images/*`, and `/.site-build-manifest.json`. auth-service's `AuthRouteTable`, which already throws on duplicate `METHOD path` keys, is the in-repo precedent to build from.

Dynamic routes may intentionally shadow generated static pages — dashboard mounted at `/` in core-only compositions is the live example. That remains allowed, but the route manifest should report the shadow when the static output is available for inspection.

Conflict detection stops at declared routes: A2A, MCP, and auth-service forward declared paths into internal routers, and the registry does not inspect that inner surface.

### 5. Finalize routes before the early webserver starts

The shell already completes plugin registration before `ShellBootloader.startEarlyWebserver()`. Build the initial route table after all `onRegister` hooks and before that start.

Route declarations must therefore be stable by the end of `onRegister`. `onReady` may initialize data used by handlers, but must not be required to make the route itself discoverable.

### 6. Move toward lifecycle registration without an immediate breaking change

The target API is ownership-explicit:

```ts
const unregister = context.http.register(route);
```

The registry records the calling plugin automatically and removes its routes during plugin teardown. Existing getter-based plugins continue through an adapter; the getters can be removed any time before `0.2.0` stable, or at `0.3.0` after.

First-party migration should prove this API before exposing it as the preferred external-plugin contract.

### 7. Keep exact-then-prefix matching during the compatibility slice

The first registry implementation preserves the current exact-then-longest-prefix method/path behavior. Once the normalized registry is stable, add compiled parameter matching as an additive feature. Existing routes do not need to migrate merely to demonstrate parameters.

### 8. Keep endpoint advertising broader than routes

Site and Preview advertising remains available through `context.endpoints.register()` because those URLs may not correspond to dynamic routes. Route-backed surfaces may instead attach optional advertisement metadata. Registering a duplicate manual endpoint for the same plugin/path should produce a diagnostic.

### 9. Represent host exposure directly

Replace the `healthEndpoint` proxy with independent server options:

```ts
{
  enableHealth: boolean;
  enableDynamicRoutes: boolean;
  routeSurface: "production" | "preview";
}
```

The compatibility default remains production-only dynamic routes and static-only preview.

## Implementation phases

### Phase 0 — Characterization and contract tests

1. Add focused tests that inventory normalized route keys for representative Rover, Relay, and Ranger compositions, including optional ATProto registry, newsletter, and Chat SDK routes where configured.
2. Add an external-plugin fixture that supplies one web route and one tool-backed API route through the existing public contracts.
3. Record current production/preview behavior, exact and prefix matching (including the trailing-slash miss on exact routes), API redirects, console-surface derivation, and handler-owned authentication behavior.
4. Pin the completed transitional-server audit with tests: nothing outside their own packages consumes `ApiServer`, `apiPort`, or standalone MCP `start()`.

Gate:

- Existing route behavior is captured without changing runtime semantics.
- The external-plugin fixture passes from a packed/public authoring boundary, not only workspace imports.

### Phase 1 — Normalized registry and conflict detection

1. Add a shell-owned `HttpRouteRegistry` using plugin route contracts from `@brains/plugins`.
2. Normalize current web and API definitions into one immutable snapshot, including `match` kind and unified method defaults.
3. Validate canonical path form, methods, reserved namespaces, duplicate method/path keys, and exact/prefix overlap.
4. Finalize the snapshot after plugin registration and before early webserver startup in every boot mode that initializes plugins.
5. Replace per-request plugin getter traversal with registry lookup, and point `deriveConsoleSurfaces` at the same snapshot.
6. Expose a read-only route manifest to shell diagnostics and tests; do not expose private route details publicly through Dashboard by default.
7. Preserve exact-then-prefix routing and response behavior, except that a tool route dispatched without a message bus now fails loudly instead of falling through to static serving.

Gate:

- A duplicate route fails boot with both plugin ids and the conflicting key.
- Route getters are not called per request.
- Register-only, startup-check, and normal boot all detect invalid route tables.
- Console navigation renders identically from the registry snapshot.
- All existing route tests and packed external-plugin smoke tests pass.

### Phase 2 — Explicit security policy

1. Add optional `security` to web and API route contracts while retaining `public` as deprecated compatibility input.
2. Add an injected `HttpRequestPrincipalResolver` backed by the existing `AuthService.resolveSession()` and `resolveBearerGrant()`.
3. Enforce `operator` routes centrally, returning `401` when unauthenticated and `403` when authenticated below the minimum level.
4. Enforce the same policy before tool-backed API execution and propagate the resolved principal into tool execution context instead of omitting the permission fields entirely.
5. Migrate first-party routes deliberately:
   - public/static metadata and ATProto registry: `none`;
   - CMS and private web-chat operations: `operator` with `"trusted"` minimum, matching today's in-handler checks; use `requireAnchor` only where a handler genuinely gates on the anchor flag today;
   - MCP, A2A, OAuth/WebAuthn, and verified webhooks: `protocol`;
   - mixed public Dashboard rendering remains `none`, while `/api/console/jump` becomes `operator`.
6. Add CSRF protection for state-changing cookie-authenticated `operator` routes. Protocol routes retain their protocol-specific replay/origin protections.
7. Keep handler-level checks during migration, then remove duplicated checks only after centralized tests cover each route.

Gate:

- No non-public API route can execute as anonymous.
- The auth matrix covers anonymous, public, trusted, Admin, expired, and suspended principals where supported by auth-service.
- MCP bearer, signed/unsigned A2A, OAuth, WebAuthn, and webhook tests remain unchanged at the protocol boundary.
- CMS and web-chat mutation tests cover CSRF failure and success.

### Phase 3 — Lifecycle-owned registration

1. Add `context.http.register()` to service and interface plugin contexts.
2. Return idempotent unregister handles and remove all owned routes during plugin teardown.
3. Make registry updates atomic so requests see either the old or new complete snapshot.
4. Adapt legacy `getWebRoutes()` and `getApiRoutes()` once during plugin registration.
5. Migrate first-party route owners package-by-package:
   - Dashboard and ATProto registry as the walking skeleton;
   - CMS and web-chat;
   - auth-service, MCP, and A2A;
   - Chat SDK, ATProto DID, Sveltia CMS, and Buttondown.
6. Publish the new API only after the packed external-plugin proof passes; retain legacy getters as the documented migration path through the alpha line.

Gate:

- Loading and unloading a test plugin adds and removes exactly its routes.
- No first-party route depends on repeated getter introspection.
- Legacy external plugins continue to mount unchanged.

### Phase 4 — Compiled matching and explicit surfaces

1. Compile the normalized table into Hono routing or an equivalent deterministic matcher.
2. Add optional path parameters without changing existing exact routes.
3. Reject ambiguous parameter patterns at registration time.
4. Split `enableHealth` from `enableDynamicRoutes` and represent production/preview policy explicitly.
5. Add static-shadow diagnostics without forbidding intentional dynamic overrides.

Gate:

- Exact-route behavior remains byte-compatible for current endpoints.
- Parameter precedence and ambiguity have focused tests.
- Preview remains static-only by default, and enabling preview routes requires explicit configuration.

### Phase 5 — Advertising, diagnostics, and cleanup

1. Add optional route advertisement metadata for Dashboard, Chat, CMS, Admin, Account, MCP, and A2A.
2. Keep manual endpoint registration for external/static URLs such as Site and Preview.
3. Diagnose route-backed advertised URLs that do not resolve to a registered route.
4. Document the route manifest and ownership model in architecture and external-plugin authoring docs.
5. Remove the standalone `ApiServer`, the dead `apiPort` option, and the standalone MCP listener path before `0.2.0` stable. The audit found only same-package test consumers, and the alpha line permits removal without a deprecation period.
6. Remove the legacy `public` route field once first-party migration completes — before `0.2.0` stable if the migration lands in time, otherwise at `0.3.0`.

Gate:

- Route-backed endpoint cards derive from mounted route metadata.
- Site and Preview advertising still works without synthetic dynamic routes.
- There is one documented production HTTP-host architecture.

## Validation matrix

### Registry

- duplicate exact routes;
- duplicate routes contributed through web/API legacy adapters;
- exact routes overlapping prefix roots;
- same path with different methods;
- malformed, non-canonical (trailing slash, encoded segments), and reserved paths;
- method-default normalization for web and API contracts;
- console-surface derivation from the snapshot;
- deterministic ordering and diagnostics;
- plugin teardown and atomic replacement.

### Authorization

- each security kind;
- `401` versus `403`;
- API tool principal propagation;
- CSRF for cookie-authenticated mutations;
- protocol-owned authentication bypasses only generic operator auth, not its own verifier.

### Host behavior

- production and preview host selection;
- `/health*` and `/images/*` ownership, including their pre-Hono preemption;
- dynamic-before-static precedence, exact-then-longest-prefix resolution;
- tool route without a message bus fails loudly;
- clean URLs and 404 fallback;
- streaming MCP, A2A, and web-chat responses under the existing idle timeout.

### Compatibility

- all model presets through startup-check;
- focused package tests for every route owner;
- packed external plugin with legacy getters;
- packed external plugin with `context.http.register()` once public;
- app-managed site rebuild followed by production and preview smoke when host behavior changes.

## Risks and mitigations

- **Boot failures reveal future collisions.** No composition collides today, so detection lands cleanly. Keep a diagnostic command to inspect conflicts, but do not retain first-wins behavior as an escape hatch; resolve each collision explicitly.
- **Central auth changes protocol behavior.** Use the `protocol` security kind and migrate operator routes first. Do not place MCP/A2A/OAuth behind generic session auth.
- **Auth-runtime work changes principal APIs concurrently.** Depend on a small resolver interface and land the implementation against the final auth-service principal contract.
- **External plugins rely on getter timing.** Characterize the packed contract first, invoke legacy getters only after `onRegister`, and document that route shape must be stable by then.
- **Early webserver startup sees a partial table.** Finalize the initial snapshot before `startEarlyWebserver()` and make later replacements atomic.
- **Parameterized routes introduce precedence bugs.** Defer them until exact normalized dispatch is stable; reject ambiguous patterns instead of relying on registration order.
- **Endpoint derivation hides external URLs.** Keep manual registration for Site, Preview, and other non-route endpoints.
- **Removing transitional servers breaks an unknown external consumer.** The in-repo audit found only same-package test consumers, but `ApiServer` is a published export; remove it before `0.2.0` stable and note the removal in release notes.

## Success criteria

- Every dynamic runtime route has one owner and one normalized manifest entry.
- Duplicate method/path registrations fail before the listener starts.
- The webserver no longer traverses plugin route getters per request.
- Operator-gated routes use a shared principal and authorization policy.
- Tool-backed routes cannot accidentally ignore their declared access policy.
- Protocol routes retain their existing authentication semantics.
- Preview route exposure is explicit.
- Route-backed endpoint advertising cannot silently point at an unmounted path.
- Existing external plugins keep working across the alpha line; the getter contracts freeze only at `0.2.0` stable.
- Static site generation and clean-URL serving remain outside the dynamic route registry.

## Related plans

- [`shell/auth-service` implementation guide](../../shell/auth-service/README.md) — the shipped multi-user and permission model
- [Operator runtime database](./operator-runtime-db.md)
- [Installable operator-console PWA](./operator-console-pwa.md)
