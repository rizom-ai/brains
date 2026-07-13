# Plan: Installable operator-console PWA

## Status

**Proposed.** Add an installable, network-first PWA shell for Dashboard, web-chat, and CMS.
The first release deliberately does not promise offline chat, offline CMS editing, mutation
replay, or background synchronization.

## Goal

Allow an operator to install the Brain console from a supported browser and launch it in a
standalone window while preserving the existing route, authentication, responsive, and
service semantics.

The PWA should:

- install from the same origin that serves the operator console;
- launch into the best registered operator surface;
- retain shared Dashboard/Chat/CMS navigation in standalone display mode;
- provide correct icons, colors, names, and mobile safe-area behavior;
- show a branded offline fallback when the Brain is unreachable;
- update safely without serving stale authenticated HTML or stale client bundles;
- remain optional for brains that do not expose operator web surfaces.

## Non-goals

- Offline CMS creation or editing.
- Queued mutation replay, uploads, or conflict resolution.
- Offline model inference or Chat responses.
- Caching entity/API responses for offline reading.
- Web push or notification permission prompts.
- Background Sync, Periodic Background Sync, or badge APIs.
- Combining Dashboard, CMS, and web-chat into one SPA.
- Replacing passkey authentication or changing session-cookie semantics.
- Registering a root-scoped service worker for public sites unless explicitly configured.

## Product levels

This plan implements only Level 1.

1. **Installable, network-first console:** manifest, service worker, offline fallback,
   standalone composition, safe updates.
2. **Read-only offline console:** selected durable snapshots with an explicit privacy and
   retention policy. Deferred.
3. **Offline authoring:** local drafts, queued mutations/uploads, conflict resolution, and
   reconnect UX. Separate future plan.

## Architecture decision

### Ownership

Create an optional operator-console PWA interface package rather than placing generic PWA
behavior in `@brains/webserver` or making one surface own all others.

Recommended package: `interfaces/console-pwa` as an `InterfacePlugin`.

It owns public GET routes for:

- `/manifest.webmanifest`;
- `/console-sw.js`;
- `/console-offline`;
- versioned icon assets, unless icons are embedded or supplied by configuration.

`@brains/webserver` remains a route host and does not silently install a service worker.
This avoids affecting public sites served from the same Brain. Models/presets opt into the
PWA interface only when they intentionally expose an installable operator console.

### Scope decision

The worker scope is `/`. This is decided, not open for a later audit, because the code
forces it:

- The production server serves the public static site and the dynamic console routes from
  one origin (`server-manager.ts` mounts `serveStatic` at `/*` on the same Hono app that
  dispatches registered web routes); the preview site is a separate server and domain.
- The console surfaces live at `/dashboard`, `/chat`, `/cms`, and `/login` — there is no
  common path prefix, and service-worker scope is prefix-based, so a single worker covering
  all surfaces must be root-scoped. Re-homing every console route under a `/console/`
  prefix would break existing deep links for no gain.

Root scope is made safe by two rules rather than by a narrower scope:

- Registration is emitted only from console surfaces, so a public visitor never registers
  the worker; only operator browsers are affected.
- The worker intercepts only navigation requests (network-first, pass-through while
  online), so an operator browsing the public site sees no behavior change when online.
  When offline, public-site paths in an operator's registered browser receive the console
  offline fallback; this is harmless and accepted.

One consequence of manifest scope `/`: same-origin public-site links clicked inside the
standalone window stay in-app. The standalone link audit covers same-origin site links, not
only external ones.

### Shared head contract

`@brains/console-theme` remains framework-neutral and may export small HTML helpers or
constants for:

- manifest link;
- `theme-color` and Apple standalone metadata;
- touch-icon links;
- guarded service-worker registration;
- standalone/safe-area CSS hooks.

Dashboard, CMS, and web-chat include this head contract only when the PWA route is
registered. Route presence—not hardcoded assumptions—determines whether registration is
emitted.

The service-worker implementation itself does not live in `@brains/console-theme`; it is
runtime behavior owned by the PWA interface.

### Manifest

The manifest is generated from typed, validated configuration and registered console
routes.

Initial contract:

```ts
interface ConsolePwaConfig {
  enabled?: boolean;
  name?: string;
  shortName?: string;
  description?: string;
  startUrl?: string;
  themeColor?: string;
  backgroundColor?: string;
  iconSource?: string;
}
```

Defaults derive from Brain identity and shared console climate tokens where practical.
Runtime validation uses Zod. The generated manifest includes:

- stable `id`;
- `name` and `short_name`;
- route-aware `start_url`;
- `scope: "/"` (see Scope decision above);
- `display: "standalone"`;
- `theme_color` and `background_color`;
- maskable and standard icons at required sizes;
- optional Dashboard/Chat/CMS shortcuts only for registered surfaces.

The default start URL is the registered Dashboard route, then Chat, then CMS. Configuration
may override it only with a same-origin path that is inside scope.

### Service-worker policy

The first service worker intercepts **only navigation requests**: network-first with the
dedicated offline page as fallback, and no authenticated navigation response ever written
to Cache Storage. Every non-navigation request — `/api/**`, `/mcp`, auth/passkey routes,
`/cms/api/**`, `/api/chat/**`, streams, uploads, bundles — passes through untouched because
the worker never handles it. This satisfies the entire "never cache APIs, auth, documents,
history, or streams" requirement structurally rather than by matching an allowlist.

A later slice extends it, still conservatively:

- Cache-first only for an explicit allowlist of immutable/versioned PWA icons and console
  static assets.
- Do not cache opaque cross-origin font responses.
- Delete old named caches during activation, limited to caches owned by this interface.
- Call `clients.claim()` only after update behavior is tested; do not force `skipWaiting()`
  in a way that can replace code during an active CMS save or Chat stream.

### Asset versioning

Chat and CMS currently expose stable client-asset URLs. A PWA cache must not make those URLs
stale across releases.

Before caching them, add one of these contracts:

1. content-hashed asset URLs; preferred; or
2. a release/build fingerprint included in the cache name plus network revalidation.

Until that contract exists, the service worker leaves surface bundles network-only. Basic
installability and offline fallback do not depend on bundle precaching.

### Authentication and privacy

- Manifest, worker, icons, and offline fallback are public and contain no operator data.
- Existing cookies continue to authenticate standalone windows.
- No authenticated HTML or API payload enters Cache Storage in Level 1.
- The offline page must not imply that a previous authenticated session is still valid.
- Logout should not require cache deletion because no private data is cached; tests assert
  that invariant.
- Passkeys and service workers require secure contexts in production. Loopback HTTP remains
  valid for local development.

## Implementation phases

Each phase is a thin vertical slice that ships an installable, testable increment; tests
are written inside the slice that needs them. The scope decision is already made above —
no audit phase precedes coding.

### Phase 1 — Walking skeleton: installable Dashboard

1. Add `interfaces/console-pwa` with typed, Zod-validated config and package-local tests.
2. Register manifest, worker, offline-page, and icon routes through the existing web-route
   contract (`public: true`), with correct content types and cache headers:
   - manifest: revalidate;
   - service worker: `no-cache`/revalidate;
   - versioned icons: long-lived immutable;
   - offline page: revalidate.
3. Add original project-owned icon assets in standard and maskable forms.
4. Add framework-neutral head/registration helpers to `@brains/console-theme` and wire
   them into Dashboard only, emitted exactly once per document and only when the PWA route
   is registered. Registration failures log to browser diagnostics only; the console works
   without service-worker support.
5. Ship the navigation-only worker: network-first navigation, branded accessible offline
   fallback with retry, nothing else intercepted, nothing cached except the offline shell.
6. Encode the route/strategy matrix as data with tests, covering every route class served
   on the origin (public site, operator surfaces, auth, assets, MCP, APIs).

Gate: Chromium installability passes from Dashboard; going offline shows the fallback and
reconnect reloads the live surface; Cache Storage contains nothing but the offline shell
and icons; non-PWA brains are byte-equivalent.

### Phase 2 — All surfaces

1. Wire the head contract into CMS and web-chat shells via PWA route availability — route
   presence, not hardcoded assumptions.
2. Generate route-aware shortcuts and start URL from registered console surfaces
   (Dashboard, then Chat, then CMS).
3. Ensure climate switching updates document theme color where supported without changing
   manifest identity.
4. Add the interface to the intended Rover/Relay presets.

Gate: manifest is discoverable from all three surfaces with identical metadata when
enabled and none when disabled; startup registers no duplicate paths.

### Phase 3 — Asset caching and update safety

1. Add cache-first handling for the explicit allowlist of immutable/versioned PWA icons
   and console static assets; cache names carry a build/release fingerprint.
2. Add activate-time cleanup limited to caches owned by this interface.
3. Prove that an active CMS edit/save and Chat stream are not interrupted by worker
   activation; only then enable `clients.claim()`.
4. Add browser tests that inspect Cache Storage after visiting Dashboard, Chat, CMS,
   login, and API routes.
5. Test an installed old release against a newly deployed worker and assets.

Gate: installed-console upgrade succeeds across two release versions; cache inspection
contains no cookies, entity data, conversation data, CMS content, or authenticated HTML;
surface bundles remain network-only until content-hashed or fingerprint-revalidated.

### Phase 4 — Standalone UX and release

1. Verify 390×844, 768×1024, and desktop standalone windows: safe areas, virtual keyboard
   behavior, composer/save-bar placement, and scroll containment.
2. Audit link behavior in standalone mode: external links, same-origin public-site links
   (which stay in-app under scope `/`), and generated/downloaded attachments.
3. Add an optional install affordance only where `beforeinstallprompt` exists; never show
   a dead install button on iOS or unsupported browsers. Document iOS "Add to Home Screen"
   without intrusive prompting.
4. Verify logout, passkey login, expired sessions, and signed-out launch behavior.
5. Run installability audits and real-device smoke tests; add package changesets,
   documentation, and deployment notes.
6. Release Level 1 without claims of offline authoring or offline Chat.

Gate: Dashboard, Chat, and CMS remain fully usable in standalone mode; browser-tab
behavior is unchanged; authenticated smoke passes.

## Validation

### Unit and route tests

- Config defaults, validation, and same-origin start URL.
- Manifest shape, route-aware shortcuts, icon declarations, and content types.
- Worker route-strategy matrix.
- Cache naming and old-cache cleanup limited to owned prefixes.
- Surface shells include registration only when the PWA interface is registered.
- No Content-Security-Policy header is set today; if one is introduced later it must
  permit the same-origin worker and manifest without broadening unrelated policies.

### Browser integration tests

- Manifest is discoverable from Dashboard, Chat, and CMS.
- Worker controls all intended console routes after reload.
- Installability criteria pass in Chromium.
- Offline navigation renders `/console-offline`.
- API, auth, Chat stream, CMS API, and authenticated HTML responses are absent from Cache
  Storage.
- Worker update does not interrupt active surface operations.
- No document-level overflow in standalone target viewports.

### Manual smoke

- Chromium desktop installation and relaunch.
- Android installation, safe areas, and keyboard.
- iOS Add to Home Screen, passkey login, and standalone navigation.
- Signed-in and signed-out launches.
- Server unavailable, reconnect, and session-expired flows.

## Risks and mitigations

- **Root worker affects the public site:** registration is emitted only from console
  surfaces and the worker intercepts only navigations, so public visitors are untouched
  and online operators see pass-through; never make generic webserver registration
  automatic.
- **Private data leaks through caches:** cache only an allowlist of public immutable assets
  and the public offline shell; assert cache contents in browser tests.
- **Stale Chat/CMS bundles:** leave stable bundle URLs network-only until they are hashed or
  fingerprint-revalidated.
- **Worker update interrupts work:** avoid unconditional immediate activation and test CMS
  saves/Chat streams across updates.
- **Install UI differs by browser:** treat install affordances as progressive enhancement
  and document iOS separately.
- **PWA becomes an implied offline promise:** label the first release as installable and
  network-first; keep offline authoring in a separate future plan.
- **Multiple plugins register PWA routes:** one optional interface owns the routes; surfaces
  only consume its availability.

## Success criteria

- Operators can install and relaunch the console in standalone mode.
- Dashboard, Chat, and CMS share one manifest identity and service worker when enabled.
- Brains without the PWA interface are unaffected.
- Offline launch produces a useful fallback rather than a browser error.
- No authenticated content or API payload is stored in Cache Storage.
- Updates do not strand old assets or interrupt active operator work.
- The release makes no unsupported offline-editing or offline-chat claims.
