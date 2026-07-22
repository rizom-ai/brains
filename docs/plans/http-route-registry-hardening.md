# Plan: HTTP route registry hardening

## Status

**Proposed.** This is correctness, security, and maintainability work for the shared HTTP surface. It is not a stable `v0.2.0` release gate unless a concrete collision or authorization vulnerability is found.

Phase 1 can proceed independently. Central operator authorization should align with [Auth runtime database](./auth-runtime-db.md) and [Multi-user and permissions](./multi-user.md); this plan must not create a second user or identity system.

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

HTTP behavior is distributed across four related mechanisms:

1. Service and interface plugins expose `getWebRoutes()` and, for services, `getApiRoutes()`.
2. `shell/core/src/plugin-routes.ts` asks every plugin for those arrays. Web routes keep their absolute path; API routes receive `/api/{pluginId}` prefixes.
3. `interfaces/webserver/src/server-manager.ts` asks for the arrays during each request and selects the first exact method/path match.
4. Plugins separately call `context.endpoints.register()` to advertise important URLs through `appInfo` and Dashboard.

The shared server also owns `/health`, `/images/*`, static files, clean URLs, and production-versus-preview host selection outside the plugin route collectors.

This baseline has useful properties: route behavior remains plugin-owned, the webserver is in-process, tool routes reuse tool execution, and static output needs no controller registration. The hardening work should preserve those properties.

## Problems to solve

### Silent conflicts

Two plugins can declare the same method/path. Collection preserves plugin iteration order and dispatch uses the first match, so one route silently shadows the other. Absolute web paths such as `/`, `/cms`, `/auth`, and `/status` make collisions realistic for first-party composition and external plugins.

### Ambiguous authorization

`WebRouteDefinition.public` currently controls whether the shared server will invoke a handler; it does not describe the route's actual security protocol. Consequently, operator-gated CMS and web-chat routes declare `public: true` and enforce sessions inside handlers. MCP, A2A, OAuth, and webhooks also declare `public: true` while implementing protocol-specific authentication themselves.

`ApiRouteDefinition.public` is present in the contract but is not enforced by shared-host API dispatch. The only current first-party API route is intentionally public, but the contract is unsafe for future private tool routes.

### Pull-based route discovery

The webserver repeatedly calls plugin route getters through the shell. This makes route ownership less explicit, prevents a stable manifest, repeats allocation/work per request, and leaves no natural registration handle for plugin unload.

### Split dispatch behavior

Handler-backed web routes and tool-backed API routes have different contracts and security behavior even though both become method/path entries on the same host.

### Exact-match-only routing

The dispatcher compares strings. There is no explicit path-parameter contract, route-specific middleware, or compiled matcher. Existing APIs therefore lean on query parameters and fixed endpoint names.

### Endpoint-advertisement drift

The endpoint registry is intentionally broader than routes because Site and Preview may be external/static URLs. However, route-backed entries such as Dashboard, Chat, CMS, MCP, and A2A are declared twice and can drift.

### Implicit preview policy

Dynamic-route dispatch is coupled to the `healthEndpoint` option. Preview currently receives static output only, but that policy is not represented directly.

### Transitional server paths

The standalone `ApiServer` and standalone MCP HTTP listener remain in source even though production composition uses the shared webserver. Their compatibility status is unclear and they increase the number of HTTP architectures maintainers must understand.

## Non-goals

- Replacing Hono or `Bun.serve`.
- Moving static site routes into the runtime route registry.
- Turning every existing query-parameter API into REST-style path parameters.
- Changing MCP, A2A, OAuth, WebAuthn, or webhook protocol semantics.
- Generating OpenAPI for arbitrary handler routes in the first implementation.
- Introducing another network listener.
- Making preview expose operator or protocol routes by default.
- Breaking the published `getWebRoutes()` or `getApiRoutes()` plugin contracts during the `0.2` compatibility window.

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
  security: HttpRouteSecurity;
  handler: (request: Request, context: HttpRequestContext) => Promise<Response>;
  advertise?: HttpRouteAdvertisement;
};
```

Tool routes receive an adapter that parses the request, invokes the tool through the message bus, and creates the response. The normalized table is the only input consumed by `ServerManager`.

### 3. Make route security explicit

A boolean cannot represent public content, operator sessions, OAuth endpoints, signed A2A, MCP bearer tokens, and webhook verification. Use a tagged contract:

```ts
type HttpRouteSecurity =
  | { kind: "none" }
  | {
      kind: "operator";
      minimumLevel: "public" | "trusted" | "anchor";
      csrf?: "required" | "not-required";
    }
  | { kind: "protocol" };
```

Semantics:

- `none`: no transport-level authentication is required.
- `operator`: the shared host resolves an authenticated runtime principal and enforces the minimum level before invoking the handler.
- `protocol`: MCP, A2A, OAuth/WebAuthn, or a webhook adapter owns authentication because generic operator-session handling is not the protocol.

During compatibility migration, routes without `security` retain their exact current `public` behavior. Do not infer that `public: true` means `security: { kind: "none" }`.

The auth service should supply a small injected request-principal resolver. The webserver must not grow a separate user store or infer users from cookies itself.

### 4. Fail closed on conflicts

The route registry rejects duplicate `(method, fullPath)` keys with an error naming both owners. It also rejects malformed/non-absolute paths and plugin routes in webserver-owned namespaces such as `/health` and `/images/*`.

Dynamic routes may intentionally shadow generated static pages—Rover's root Dashboard is one example. That remains allowed, but the route manifest should report the shadow when the static output is available for inspection.

### 5. Finalize routes before the early webserver starts

The shell already completes plugin registration before `ShellBootloader.startEarlyWebserver()`. Build the initial route table after all `onRegister` hooks and before that start.

Route declarations must therefore be stable by the end of `onRegister`. `onReady` may initialize data used by handlers, but must not be required to make the route itself discoverable.

### 6. Move toward lifecycle registration without an immediate breaking change

The target API is ownership-explicit:

```ts
const unregister = context.http.register(route);
```

The registry records the calling plugin automatically and removes its routes during plugin teardown. Existing getter-based plugins continue through an adapter until the public compatibility policy allows removal.

First-party migration should prove this API before exposing it as the preferred external-plugin contract.

### 7. Keep exact matching during the compatibility slice

The first registry implementation preserves exact method/path behavior. Once the normalized registry is stable, add compiled parameter matching as an additive feature. Existing routes do not need to migrate merely to demonstrate parameters.

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
3. Record current production/preview behavior, exact matching, API redirects, and handler-owned authentication behavior.
4. Audit exports and consumers of `ApiServer` and standalone MCP HTTP startup before deciding their deprecation status.

Gate:

- Existing route behavior is captured without changing runtime semantics.
- The external-plugin fixture passes from a packed/public authoring boundary, not only workspace imports.

### Phase 1 — Normalized registry and conflict detection

1. Add a shell-owned `HttpRouteRegistry` using plugin route contracts from `@brains/plugins`.
2. Normalize current web and API definitions into one immutable snapshot.
3. Validate paths, methods, reserved namespaces, and duplicate method/path keys.
4. Finalize the snapshot after plugin registration and before early webserver startup in every boot mode that initializes plugins.
5. Replace per-request plugin getter traversal with registry lookup.
6. Expose a read-only route manifest to shell diagnostics and tests; do not expose private route details publicly through Dashboard by default.
7. Preserve exact routing and response behavior.

Gate:

- A duplicate route fails boot with both plugin ids and the conflicting key.
- Route getters are not called per request.
- Register-only, startup-check, and normal boot all detect invalid route tables.
- All existing route tests and packed external-plugin smoke tests pass.

### Phase 2 — Explicit security policy

1. Add optional `security` to web and API route contracts while retaining `public` as deprecated compatibility input.
2. Add an injected `HttpRequestPrincipalResolver` backed by auth-service runtime principals.
3. Enforce `operator` routes centrally, returning `401` when unauthenticated and `403` when authenticated below the minimum level.
4. Enforce the same policy before tool-backed API execution and propagate the resolved principal into tool execution context instead of always using `anonymous`.
5. Migrate first-party routes deliberately:
   - public/static metadata and ATProto registry: `none`;
   - CMS and private web-chat operations: `operator` with anchor minimum;
   - MCP, A2A, OAuth/WebAuthn, and verified webhooks: `protocol`;
   - mixed public Dashboard rendering remains `none`, while `/api/console/jump` becomes `operator`.
6. Add CSRF protection for state-changing cookie-authenticated `operator` routes. Protocol routes retain their protocol-specific replay/origin protections.
7. Keep handler-level checks during migration, then remove duplicated checks only after centralized tests cover each route.

Gate:

- No non-public API route can execute as anonymous.
- The auth matrix covers anonymous, public, trusted, anchor, expired, and suspended principals where supported by auth-service.
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
6. Publish the new API only after the packed external-plugin proof passes; retain legacy getters for the documented compatibility window.

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

1. Add optional route advertisement metadata for Dashboard, Chat, CMS, MCP, and A2A.
2. Keep manual endpoint registration for external/static URLs such as Site and Preview.
3. Diagnose route-backed advertised URLs that do not resolve to a registered route.
4. Document the route manifest and ownership model in architecture and external-plugin authoring docs.
5. Deprecate or remove standalone `ApiServer` and MCP listener paths only after the export audit and compatibility window permit it.
6. Remove the legacy `public` route field only in a separately announced breaking release.

Gate:

- Route-backed endpoint cards derive from mounted route metadata.
- Site and Preview advertising still works without synthetic dynamic routes.
- There is one documented production HTTP-host architecture.

## Validation matrix

### Registry

- duplicate exact routes;
- duplicate routes contributed through web/API legacy adapters;
- same path with different methods;
- malformed and reserved paths;
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
- `/health` and `/images/*` ownership;
- dynamic-before-static precedence;
- clean URLs and 404 fallback;
- streaming MCP, A2A, and web-chat responses under the existing idle timeout.

### Compatibility

- all model presets through startup-check;
- focused package tests for every route owner;
- packed external plugin with legacy getters;
- packed external plugin with `context.http.register()` once public;
- app-managed site rebuild followed by production and preview smoke when host behavior changes.

## Risks and mitigations

- **Boot failures reveal existing collisions.** Add a temporary diagnostic-only command to inspect conflicts, but do not retain first-wins behavior as an escape hatch. Resolve each collision explicitly.
- **Central auth changes protocol behavior.** Use the `protocol` security kind and migrate operator routes first. Do not place MCP/A2A/OAuth behind generic session auth.
- **Auth-runtime work changes principal APIs concurrently.** Depend on a small resolver interface and land the implementation against the final auth-service principal contract.
- **External plugins rely on getter timing.** Characterize the packed contract first, invoke legacy getters only after `onRegister`, and document that route shape must be stable by then.
- **Early webserver startup sees a partial table.** Finalize the initial snapshot before `startEarlyWebserver()` and make later replacements atomic.
- **Parameterized routes introduce precedence bugs.** Defer them until exact normalized dispatch is stable; reject ambiguous patterns instead of relying on registration order.
- **Endpoint derivation hides external URLs.** Keep manual registration for Site, Preview, and other non-route endpoints.
- **Removing transitional servers breaks consumers.** Audit exports, deprecate first, and remove only at a declared compatibility boundary.

## Success criteria

- Every dynamic runtime route has one owner and one normalized manifest entry.
- Duplicate method/path registrations fail before the listener starts.
- The webserver no longer traverses plugin route getters per request.
- Operator-gated routes use a shared principal and authorization policy.
- Tool-backed routes cannot accidentally ignore their declared access policy.
- Protocol routes retain their existing authentication semantics.
- Preview route exposure is explicit.
- Route-backed endpoint advertising cannot silently point at an unmounted path.
- Existing external plugins keep working through the `0.2` compatibility window.
- Static site generation and clean-URL serving remain outside the dynamic route registry.

## Related plans

- [Auth runtime database](./auth-runtime-db.md)
- [Multi-user and permissions](./multi-user.md)
- [Operator runtime database](./operator-runtime-db.md)
- [Installable operator-console PWA](./operator-console-pwa.md)
