# Plan: HTTP route registry hardening

## Status

**Proposed — revalidated on 2026-08-07; Phases 0 and 1 complete.** The normalized registry, startup conflict detection, immutable dispatch snapshot, internal manifest, and fail-closed shared-host admission are implemented. The documented handler-backed getter remains the canonical stable `0.2` authoring contract; there is no secondary route path. Remaining security, matcher, advertising, and cleanup phases require separate approval and do not gate stable `v0.2.0`.

The [public-authoring release gate](./public-authoring-api-0.2.md) deliberately freezes only the existing handler-backed web-route contract. It excludes tool-backed API routes, non-public shared-host admission, centralized operator authentication, and `context.http.register()` from the `0.2` stable ledger. This plan must not widen that ledger accidentally.

Characterization is green against current canonical compositions and a packed external handler route. The current registry slice changes no stable public authoring declarations. If Phase 2 is approved later, central operator authorization must use the shipped [`auth-service` boundary](../../shell/auth-service/README.md), which owns runtime principals, roles, statuses, sessions, and Anchor identity; this plan must not create a second user or identity system.

## Goal

Make every runtime HTTP route part of one deterministic, inspectable, lifecycle-owned route table with:

- explicit ownership;
- startup-time conflict detection;
- consistent authorization semantics;
- one dispatch pipeline for handler-backed and tool-backed routes;
- patch-stable behavior for the documented handler-backed `0.2` contract;
- explicit production/preview exposure; and
- route-backed endpoint advertising that cannot silently drift.

The shared webserver remains the canonical HTTP listener.

## Current baseline

HTTP behavior now has one finalized composition boundary:

1. Internal service and interface plugins expose `getWebRoutes()`; service plugins may also expose `getApiRoutes()`. The stable external `0.2` authoring path remains narrower and covers handler-backed web routes only.
2. `shell/core/src/http-route-registry.ts` invokes each route getter once after plugin registration-complete hooks, validates canonical paths, route-kind methods, reserved namespaces, and duplicate `(method, fullPath)` keys, then freezes one normalized snapshot plus a handler-free diagnostic manifest.
3. `interfaces/webserver/src/server-manager.ts` resolves a normalized route snapshot once when the early webserver starts. Dispatch order remains exact handler, longest matching handler prefix, then exact tool-backed API route. Prefix matching respects segment boundaries; API routes remain exact-only.
4. Routes with `public: false` now fail closed for both handlers and tools. `public: true` remains admission-only: protocol and session handlers still authenticate internally.
5. Plugins separately call `context.endpoints.register()` to advertise important URLs through `appInfo` and Dashboard.

The shared server also owns `/health/*`, `/images/*`, the blocked `/.site-build-manifest.json`, static files, clean URLs, and production-versus-preview host selection. Health is split across `/health/live`, `/health/ready`, and `/health/operate`; the aggregate `/health` endpoint is absent. Dynamic routes run only on the production surface; preview remains static-only. MCP HTTP mounts on the shared host, and production rejects configurations without the webserver. The unused standalone `ApiServer` export is absent; the MCP transport's test-only listener method remains cleanup work.

Canonical minimal, personal, publishing, team, commerce, docs, and Rizom manifests are checked and currently contain no method/path collisions. Configured Chat SDK routes and the newsletter tool route have focused inventory coverage. The packed external handler-route fixture installs and serves outside the monorepo through documented `@rizom/brain/*` entry points.

## Problems to solve

### Ambiguous authorization

`public` now fails closed consistently, but it still describes only shared-host admission rather than the route's actual security protocol. Consequently, operator-gated CMS and web-chat routes declare `public: true` and enforce sessions inside handlers. MCP, A2A, OAuth, and webhooks also declare `public: true` while implementing protocol-specific authentication themselves.

### Limited matcher contract

Handler routes support exact and typed prefix matching, including segment-boundary and longest-prefix precedence. API routes remain exact-only. There is no path-parameter contract, route-specific middleware, or compiled ambiguity check, so existing APIs still lean on query parameters, fixed endpoint names, and handler-local parsing.

### Endpoint-advertisement drift

The endpoint registry is intentionally broader than routes because Site and Preview may be external/static URLs. However, route-backed entries such as Dashboard, Chat, CMS, MCP, and A2A are declared twice and can drift.

### Implicit preview policy

Dynamic-route dispatch is coupled to the `healthEndpoint` option. Preview currently receives static output only, but that policy is not represented directly.

### Transitional server path

The unused standalone `ApiServer` class is removed. Production MCP composition uses the shared webserver, but the MCP transport still carries a test-only standalone listener method. That dead method and its listener-specific tests remain Phase 5 cleanup; they are not a production startup path.

## Non-goals

- Replacing Hono or `Bun.serve`.
- Moving static site routes into the runtime route registry.
- Turning every existing query-parameter API into REST-style path parameters.
- Changing MCP, A2A, OAuth, WebAuthn, or webhook protocol semantics.
- Generating OpenAPI for arbitrary handler routes in the first implementation.
- Introducing another network listener.
- Making preview expose operator or protocol routes by default.
- Breaking the documented handler-backed `getWebRoutes()` contract during `0.2` patch releases.
- Adding tool-backed APIs, private shared-host admission, centralized operator auth, or lifecycle route registration to the stable `0.2` public-authoring ledger.
- Completing post-baseline security, lifecycle, parameter-routing, advertising, or cleanup phases merely to nominate stable `0.2.0`.

## Architecture decisions

### 1. Keep one shared HTTP host

`@brains/webserver` remains the listener and static-file host. The shell owns route composition; plugins own handlers. No plugin should open its own production HTTP port.

### 2. Add one normalized internal route model

Normalize the canonical route declarations into one internal shape before dispatch:

```ts
type RegisteredHttpRoute =
  | {
      ownerPluginId: string;
      kind: "handler";
      method: WebRouteMethod;
      fullPath: string;
      match: "exact" | "prefix";
      sharedHostAdmission: "admit" | "deny";
      handler: WebRouteHandler;
    }
  | {
      ownerPluginId: string;
      kind: "tool";
      method: ApiRouteDefinition["method"];
      fullPath: string;
      match: "exact";
      sharedHostAdmission: "admit" | "deny";
      definition: ApiRouteDefinition;
    };
```

The shape above is internal, and declaration tests prevent it from leaking through `@rizom/brain`. The existing `public` field maps directly to shared-host admission; it is not a second security model or an adapter path. Tool routes receive an internal handler that parses the request, invokes the tool through the message bus, and creates the response. A matched tool route without a message bus returns `500` instead of falling through to static serving. The normalized table is the only dynamic-route input used during dispatch.

### 3. Make route security explicit

A boolean cannot represent public content, operator sessions, OAuth endpoints, signed A2A, MCP bearer tokens, and webhook verification. Use a tagged contract:

```ts
type HttpRouteSecurity =
  | { kind: "none" }
  | {
      kind: "operator";
      minimumLevel: "public" | "trusted" | "admin";
      csrf?: "required" | "not-required";
    }
  | { kind: "protocol" };
```

Semantics:

- `none`: no transport-level authentication is required.
- `operator`: the shared host resolves an authenticated runtime principal and enforces the minimum level before invoking the handler.
- `protocol`: MCP, A2A, OAuth/WebAuthn, or a webhook adapter owns authentication because generic operator-session handling is not the protocol.

Explicit route security is not part of the implemented `0.2` contract. `public: true` means only that the shared host admits the request; it does **not** imply `security: { kind: "none" }`, because many admitted handlers perform protocol or session authentication themselves. `public: false` fails closed for both handler and tool routes; tool execution is never reached. A future explicit security contract must replace this field at a declared breaking boundary rather than coexist through a parallel variant.

The auth service should supply a small injected request-principal resolver backed by its existing active-session and bearer-principal services. The webserver must not grow a separate user store, parse auth cookies itself, or treat Anchor identity as a permission level. Operator minimum levels are `public`, `trusted`, and `admin`; any future Anchor requirement is an independent policy facet.

### 4. Fail closed on conflicts

The route registry rejects duplicate `(method, fullPath)` keys with an error naming both owners, including collisions between exact and prefix declarations at the same base path. It also rejects non-absolute or non-canonical paths (including trailing slashes, doubled slashes, and percent-encoded segments) and plugin routes in webserver-owned namespaces such as `/health/*`, `/images/*`, and `/.site-build-manifest.json`.

Dynamic routes may intentionally shadow generated static pages—the root Dashboard is one example. That remains allowed, but the route manifest should report the shadow when the static output is available for inspection.

### 5. Finalize routes before the early webserver starts

The shell already completes plugin registration before `ShellBootloader.startEarlyWebserver()`. Build the initial route table after all `onRegister` hooks and before that start.

Route declarations must therefore be stable by the end of `onRegister`. `onReady` may initialize data used by handlers, but must not be required to make the route itself discoverable.

### 6. Keep one authoring ingress

The documented handler-backed `getWebRoutes()` contract is the only stable `0.2` authoring ingress. The shell records ownership while collecting each plugin's declarations and finalizes one registry after registration completes.

Do not add `context.http.register()` or another declaration API alongside it. Any future replacement requires separate approval, a declared breaking boundary, first-party migration, and a packed external proof in the same change. It must remove the superseded ingress rather than retain an adapter.

### 7. Preserve exact and prefix matching

The registry preserves current exact-before-prefix, longest-prefix, and segment-boundary behavior for handler routes; API routes remain exact. A later compiled matcher may add path parameters as an additive feature. Existing routes do not need to migrate merely to demonstrate parameters.

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

The current default remains production-only dynamic routes and static-only preview.

## Remaining implementation phases

### Phase 2 — Explicit security policy

1. Approve a breaking contract boundary that replaces `public` with explicit `security`; do not accept both inputs.
2. Add an injected `HttpRequestPrincipalResolver` backed by auth-service runtime principals.
3. Enforce `operator` routes centrally, returning `401` when unauthenticated and `403` when authenticated below the minimum level.
4. Enforce the same policy before tool-backed API execution and propagate the resolved principal into tool execution context instead of always using `anonymous`.
5. Migrate first-party routes deliberately from observed handler behavior rather than from their current boolean:
   - genuinely public metadata and ATProto registry reads: `none`;
   - routes that require a normal browser session and have one minimum permission, such as CMS or operator-console mutations: `operator` with `trusted` or `admin` as appropriate;
   - auth-service OAuth/WebAuthn/account flows, MCP, A2A, Chat SDK, web-chat mixed-access flows, and verified webhooks: `protocol` while those handlers own protocol/session semantics;
   - mixed public Dashboard rendering remains `none`; classify `/api/console/jump` from its actual session and permission requirement before migration.
6. Keep Admin permission and Anchor identity independent. A route may require one, both, or neither; `admin` must never be inferred to mean Anchor.
7. Add CSRF protection for state-changing cookie-authenticated `operator` routes. Protocol routes retain their existing same-origin, replay, token, signature, or webhook protections.
8. Migrate every first-party owner atomically at the approved boundary and remove duplicated handler checks only after centralized tests cover each route.

Gate:

- No non-public API route can execute as anonymous.
- The auth matrix covers anonymous, public, trusted, Admin, expired, and suspended principals where supported by auth-service.
- MCP bearer, signed/unsigned A2A, OAuth, WebAuthn, and webhook tests remain unchanged at the protocol boundary.
- CMS and web-chat mutation tests cover CSRF failure and success.

### Phase 3 — Authoring contract replacement

This phase requires separate approval and a declared breaking release. It is not part of stable `0.2`.

1. Decide whether lifecycle registration materially improves the canonical getter contract.
2. If approved, define one ownership-explicit replacement rather than a second ingress.
3. Return idempotent unregister handles and remove all owned routes during plugin teardown.
4. Make registry updates atomic so requests see either the old or new complete snapshot.
5. Migrate every first-party route owner and the packed external fixture in the same change.
6. Remove the superseded getter ingress when publishing the replacement; do not retain an adapter.

Gate:

- Exactly one route-authoring ingress exists.
- Loading and unloading a test plugin adds and removes exactly its routes.
- No first-party route depends on repeated getter introspection.
- The packed external fixture proves the replacement contract before publication.

### Phase 4 — Compiled matching and explicit surfaces

1. Compile the normalized table into Hono routing or an equivalent deterministic matcher.
2. Add optional path parameters without changing existing exact routes.
3. Reject ambiguous parameter patterns at registration time.
4. Split `enableHealth` from `enableDynamicRoutes` and represent production/preview policy explicitly.
5. Add static-shadow diagnostics without forbidding intentional dynamic overrides.

Gate:

- Existing exact, prefix, and handler/tool precedence remains unchanged for current endpoints unless a separately reviewed ambiguity test justifies a correction.
- Parameter precedence and ambiguity have focused tests.
- Preview remains static-only by default, and enabling preview routes requires explicit configuration.

### Phase 5 — Advertising, diagnostics, and cleanup

1. Add optional route advertisement metadata for Dashboard, Chat, CMS, MCP, and A2A.
2. Keep manual endpoint registration for external/static URLs such as Site and Preview.
3. Diagnose route-backed advertised URLs that do not resolve to a registered route.
4. Document the route manifest and ownership model in architecture and external-plugin authoring docs.
5. Remove the MCP transport's test-only standalone listener method and listener-specific tests; retain shared-host tests that prevent production listener startup from returning.
6. Remove `public` only as part of the separately approved explicit-security replacement; never support both route-security inputs.

Gate:

- Route-backed endpoint cards derive from mounted route metadata.
- Site and Preview advertising still works without synthetic dynamic routes.
- There is one documented production HTTP-host architecture.

## Validation matrix

### Registry

- duplicate exact routes;
- duplicate routes contributed through handler and tool declarations;
- exact/prefix collisions at one base path;
- same path with different methods;
- malformed and reserved paths;
- deterministic ordering and diagnostics;
- exact-handler, longest handler-prefix, then exact-tool precedence;
- longest-prefix and segment-boundary behavior;
- plugin teardown and atomic replacement.

### Authorization

- each security kind;
- `401` versus `403`;
- API tool principal propagation;
- CSRF for cookie-authenticated mutations;
- protocol-owned authentication bypasses only generic operator auth, not its own verifier.

### Host behavior

- production and preview host selection;
- `/health/*` and `/images/*` ownership;
- dynamic-before-static precedence;
- clean URLs and 404 fallback;
- streaming MCP, A2A, and web-chat responses under the existing idle timeout.

### Contract stability

- canonical minimal, personal, publishing, team, commerce, docs, and Rizom compositions through register-only or startup-check as appropriate;
- focused package tests for every route owner;
- packed external interface with the stable handler-backed web-route contract;
- package-local tool-route getter coverage without adding it to the stable `0.2` ledger;
- packed external lifecycle registration only if and when its public authoring shape is approved;
- app-managed site rebuild followed by production and preview smoke when host behavior changes.

## Risks and mitigations

- **Boot failures reveal external or newly composed collisions.** The startup error names both owners and the conflicting key. Resolve each collision explicitly; do not restore first-wins behavior as an escape hatch.
- **Central auth changes protocol behavior.** Use the `protocol` security kind and migrate operator routes first. Do not place auth-service, MCP, A2A, Chat SDK, mixed-access web chat, OAuth, or WebAuthn behind generic session admission without a protocol-specific proof.
- **The webserver duplicates shipped auth behavior.** Depend on a small resolver interface backed by auth-service active principals; do not parse cookies, query auth storage, duplicate status rules, or conflate Admin and Anchor.
- **External plugins rely on getter timing.** Route getters run once after registration-complete hooks. Keep the packed contract proof and document that getter output must be stable by that boundary.
- **Parameterized routes introduce precedence bugs.** Defer them until exact normalized dispatch is stable; reject ambiguous patterns instead of relying on registration order.
- **Endpoint derivation hides external URLs.** Keep manual registration for Site, Preview, and other non-route endpoints.
- **Standalone listeners regress the deployment topology.** Remove the remaining MCP test listener in Phase 5 and keep regression tests that prevent production listener startup from returning.

## Success criteria

- Every dynamic runtime route has one owner and one normalized manifest entry.
- Duplicate method/path registrations fail before the listener starts.
- The webserver no longer traverses plugin route getters per request.
- Operator-gated routes use a shared principal and authorization policy.
- Tool-backed routes cannot accidentally ignore their declared access policy.
- Protocol routes retain their existing authentication semantics.
- Preview route exposure is explicit.
- Route-backed endpoint advertising cannot silently point at an unmounted path.
- The documented external handler-route contract remains patch-stable throughout `0.2`.
- Static site generation and clean-URL serving remain outside the dynamic route registry.

## Related plans

- [Public authoring API contract for `v0.2.0`](./public-authoring-api-0.2.md) — the stable external ledger this plan must not widen accidentally
- [`shell/auth-service` implementation guide](../../shell/auth-service/README.md) — the shipped multi-user and permission model
- [Operator runtime database](./operator-runtime-db.md)
- [Installable operator-console PWA](./operator-console-pwa.md)
