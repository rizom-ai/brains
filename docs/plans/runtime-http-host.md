# Plan: the runtime owns its HTTP host

## Status

**Implemented on `work/runtime-http-host`.**
Approved after review, following the A2A
and ATProto conversions on `work/plugin-api-boundaries`. Phase 1 is the independently green
extraction commit `7f954b5531`; phases 2–3 are the atomic ownership/configuration cutover.

Split out of [plugin-interface-boundaries](./plugin-interface-boundaries.md):
`@brains/webserver` could not be expressed on the declarative interface contract because
it _was_ the host that contract delegates to. The design and before-state rationale below
record the approved migration, not remaining runtime behavior.

## Goal

`interfaces/webserver` is deleted. The shell starts one HTTP listener itself, from runtime
configuration, whenever the brain it is booting has something to serve. No plugin, bundle,
resolver or bootloader names an interface called `webserver`, and a brain's production port
is declared in one place.

## Why webserver is not a conversion

The authoring contract states that the runtime owns HTTP hosting
(`docs/public-release/AUTHORING_API_0.2.md`). Webserver is that hosting: it reads the
finalized route snapshot through `context.httpRoutes.getRoutes()`, executes tool-backed API
routes over the message bus, serves the built site, images and `/health/*`, and runs
`Bun.serve()`. A consumer of the contract cannot also be its implementation. Converting it
would mean a `defineInterface` whose `listen` slot opens the port every other interface's
routes are served on, which is the runtime's job wearing a plugin's name.

Three places already treat it as infrastructure rather than as a plugin:

1. `packages/brain-cli/src/lib/definition-registry.ts` appends `webserver` to any brain
   definition that contains an interface and throws `Canonical runtime has no webserver
interface host` if the canonical model lacks it.
2. `shell/core/src/initialization/shellBootloader.ts` starts the daemon named
   `webserver:webserver` by string before initial sync, ahead of every other daemon.
3. `shell/app/src/brain-resolver.ts` computes `webserverEnabled` from the active
   interfaces and derives both the webserver's `enablePreview` default and MCP's
   `transport` from it. `interfaces/mcp/src/index.ts` then re-checks
   `plugins.has("webserver")` and throws if HTTP transport was chosen without it.

Two drifts follow from the disguise:

- **The production port is declared twice.** `brain.yaml`'s top-level `port:` sets
  `deployment.ports.production`, which `shell/app/src/app.ts` uses to compute
  `localSiteUrl`. The listener itself binds `plugins.webserver.productionPort`, a separate
  Zod default in `interfaces/webserver/src/config.ts`. They agree only because both default
  to 8080; setting `port: 9000` moves the advertised URL and leaves the socket on 8080.
- **The site directories are declared twice.** Webserver serves
  `productionDistDir`/`previewDistDir`/`sharedImagesDir`; site-builder writes
  `productionOutputDir`/`previewOutputDir`/`sharedImagesDir`. Same three defaults, two
  schemas, no link.

`apiPort` in the webserver config is read by nothing but test fixtures; the standalone API
listener it once configured was removed by the route-registry hardening work. `previewPort`
also binds nothing: preview already uses hostname routing on the production listener.
Neither obsolete listener knob moves into the new runtime section.

## Design

### Where the code lives

A new shell package, `shell/http-host` (`@brains/http-host`), holds what `interfaces/webserver`
holds today minus the plugin class: `ServerManager` (Hono app, static serving with clean
URLs, `/health/live|ready|operate`, `/images/*`, the blocked build manifest, route dispatch,
production-versus-preview host selection), `createApiRouteHandler`, the placeholder
template, and their tests. `hono` and `@hono/bun-compress` move with it and become shell
dependencies. The route types it consumes already live in
`@brains/plugins/internal/http-routes`, so the import direction is shell → shell.

`Shell` owns an `HttpHost` the way it owns `HttpRouteRegistry` and `EndpointRegistry` today.
The bootloader's `startEarlyWebserver` becomes `startHttpHost` at the same point in the
sequence (before initial sync, normal non-worker boot only). Worker, register-only and
startup-check execution never binds a socket or creates placeholder directories.

Register host cleanup with the shell's existing transactional lifecycle before acquisition
can fail. Failed boot must release the port. Shutdown must close HTTP admission and drain
admitted requests before tearing down plugins, subscriptions or databases used by handlers;
stream cancellation and bounded shutdown must not leave handlers using released services.
Repeated shutdown remains idempotent. An intentionally absent host is not unhealthy.

### When the host runs

For eligible normal boot, the host starts when, after route finalization, **the route
snapshot is non-empty or a site is configured to be served**. Default placeholder paths do
not themselves count as a configured site. A site-output declaration from an active builder,
or an explicit `http.productionDistDir` for externally built static content, supplies that
intent. Loading a site package without a serving declaration does not implicitly open a port.

Transport configuration comes first; host activation follows it. The resolver cannot infer
MCP's transport from finalized routes: those routes do not exist until registration, and
MCP's own route depends on the transport choice. Preserve explicit user overrides and use
composition defaults instead: canonical `core` uses MCP stdio and outbound-only A2A;
canonical `web` selects MCP HTTP and enables A2A inbound routes. Neither protocol asks
whether the host will run or whether a plugin called `webserver` exists. Other compositions
choose these protocol settings explicitly; merely adding a site or webhook does not switch
MCP from stdio to HTTP.

| posture                                        | routes         | site | host |
| ---------------------------------------------- | -------------- | ---- | ---- |
| `core`, MCP stdio and outbound-only A2A        | none           | no   | off  |
| `core` + explicitly configured MCP HTTP        | `/mcp`         | no   | on   |
| `core` + explicitly enabled A2A inbound        | A2A routes     | no   | on   |
| `web` bundle (dashboard, studio, admin)        | many           | no   | on   |
| `site` bundle (site-builder, no web interface) | none           | yes  | on   |
| chat only with a declared webhook              | webhook routes | no   | on   |

The headless boot test already asserts `Production server listening` is absent from a
`core` brain's stderr. Preserve it by keeping core's A2A outbound-only, not by making A2A
routes unconditional. MCP's `plugins.has("webserver")` guard is deleted: declaring the
`/mcp` route is what makes the host run.

### Consumers of web presence

MCP is not the only consumer to migrate:

- `interfaces/a2a/src/a2a-interface.ts` currently gates both routes and advertisements on
  `plugins.has("webserver")`. Replace that with an explicit inbound protocol setting,
  resolved before registration. Outbound tools remain available when inbound is disabled.
- `plugins/atproto/src/records.ts` uses the same plugin-presence check to select site URLs
  and `did:web` identities. Replace it with runtime-owned web-presence information backed by
  finalized serving intent and the resolved public URL, not plugin membership, a guessed
  port or the mere presence of a domain. Keep headless repo-DID behavior and hosted
  `did:web` validation unchanged.

Use an existing typed presentation capability if the prerequisite conversions provide it;
otherwise add the narrow runtime-owned read capability needed by ATProto. It describes
configured exposure, not transient socket health, and cannot influence route declarations.
Inventory all remaining `webserver` presence checks again at cutover.

### Configuration

One runtime section replaces `plugins.webserver`:

```yaml
port: 8080 # production listener, unchanged knob, now the only one
http:
  preview: true # default: true when site-builder is active, else false
  # Optional for externally built sites; omit these when site-builder owns the output.
  productionDistDir: ./dist/site-production
  previewDistDir: ./dist/site-preview
  imagesDir: ./dist/images
```

`port` maps to the existing `deployment.ports.production` and is the only listener-port
input. Preview uses that same listener with the existing preview-host selection; there is
no `http.previewPort` or `http.apiPort`. Reject unknown HTTP settings rather than silently
accepting dead knobs. Audit `deployment.ports.preview` and generated deployment consumers:
remove obsolete preview-listener wiring without introducing another listener or advertising
4321 as a live endpoint.

The directory bridge is one schema-validated static-site output declaration with an owner
and resolved production, preview and image directories. Site-builder contributes it from
its already-parsed `productionOutputDir`, `previewOutputDir` and `sharedImagesDir` by the
registration-complete boundary. Define the shared contract at the shell/plugin authoring
boundary; shell/app and shell/http-host must not import site-builder's implementation,
inspect a private config field or reparse raw plugin overrides with copied defaults. The
shell collects and finalizes this declaration alongside route composition and passes the
resolved paths to the host. Reject multiple competing site-output owners.

When site-builder owns the output, its declaration is authoritative. Resolve paths against
one runtime working directory; matching explicit HTTP paths are harmless, but conflicting
ones fail configuration/finalization before a socket opens. Without a builder, explicit
HTTP directories describe externally built content. With routes but no configured site,
the host may serve placeholders from the default directories without treating those
defaults as an activation signal. An image or preview override alone does not select a
production static site.

Reject `plugins.webserver` with a message pointing port users to `port` and other supported
settings to `http`, including the fact that preview no longer has a separate port. Do not
retain a compatibility mapping that silently makes obsolete input valid.

### What the plugin class did that the host keeps

- **Site and Preview endpoints and interactions.** For a configured host, register `Site`
  (priority 10) when a public site URL is available and `Preview` (priority 20, admin
  visibility) when preview is on and its URL is available, directly on the shell's endpoint
  and interaction registries. Use a runtime owner, not a synthetic plugin, and remove its
  entries on rollback/shutdown. Registration must remain available in composition checks
  without starting a listener. The dashboard's Endpoints card reads them as today.
- **Placeholder dist directories.** Created on normal host start when absent, so a fresh
  brain serves a page before its first site build.
- **Health.** `/health/*` stays on the production control plane, including requests arriving
  on preview hostnames; preview does not dispatch plugin routes. The daemon-style
  `healthCheck` becomes a `runtime-health` contribution named `http-host` with the same
  running/URL details, next to `job-worker` and `attempt-leases`. Distinguish intentionally
  disabled from expected-but-unavailable hosting.

### What it did that nothing keeps

- Its own `productionPort`/`previewPort`/`apiPort` schema.
- The `webserver` plugin id, daemon name, bundle membership and eval-disable entry.
- The handler's `interfaceType: "webserver"` and `externalActorId("webserver",
"anonymous")` on tool-backed API routes become `"http"`. No permission rule matches
  `webserver:*` today (checked across `shell/` and canonical definitions), so no policy
  changes meaning.
- `interfaces/webserver/README.md`, which documents a `WebServerInterface` with `.use()`
  middleware and a `TestClient` that have not existed for some time.

## Phases

Phase 1 is an independently green extraction commit. Phases 2 and 3 form one atomic
ownership/configuration cutover with its own changeset: do not ship an inert webserver
plugin whose old settings are accepted but ignored. Each shippable commit leaves every
gate green. Approval and the interface conversion prerequisite were satisfied before
implementation.

### 1. The host has a home

`shell/http-host` is created with `ServerManager`, `createApiRouteHandler`, the placeholder
template and the server-manager and API-handler test suites, moved with imports repointed
and nothing else changed. The plugin-specific webserver-interface suite stays with
`interfaces/webserver`, which imports the extracted implementation. Arch rules admit
`shell/http-host` and its two Hono dependencies.

Tests: the moved suites pass under the new package; the webserver interface suite still
passes; `arch:check` and `deps:check` accept the new edge.

### 2. The shell starts it

`Shell` constructs `HttpHost` from a new `http` block on shell config, wired from
`deployment.ports.production` and the finalized site-output declaration or explicit static
configuration. `http:` overrides land in `instance-overrides.ts` in this cutover, not in a
later release. `startEarlyWebserver` becomes `startHttpHost` with the routes-or-site rule
and explicit boot-mode exclusions. The shell lifecycle owns acquisition, rollback,
admission shutdown and request draining. The host registers Site and Preview endpoints
and interactions and contributes `http-host` health. Remove the plugin-owned listener and
advertisements atomically with Phase 3, so exactly one owner exists.

Tests, written first:

- One declared route starts the host; a routeless, siteless brain does not. Site-only and
  externally built static-site configurations start it without plugin routes.
- An app/resolver-to-shell test proves `port: 9000` both binds 9000 and advertises
  `http://localhost:9000`; preview requests use that same port with the preview hostname.
- Non-default site-builder output paths are both written and served; conflicting HTTP
  paths and duplicate output owners fail before binding.
- Site and Preview entries come from the runtime alone, remain inspectable in composition
  checks, and disappear on rollback/shutdown. Intentionally disabled hosting is healthy.
- Worker, register-only and startup-check modes open no listener or placeholder directories,
  even with declared routes or a site. The headless boot test retains its no-listener check.
- A failure after listener startup releases the port; shutdown is idempotent and preserves
  handler dependencies while admitted requests drain, including streaming cancellation.

### 3. Nothing names webserver

Delete `interfaces/webserver`, its `canonical-brain.ts` entry, the definition-registry
injection, `webserverEnabled` and the `plugins.webserver` defaults in the resolver, the
`webserver` member and `evalDisable` entry in `canonical-bundles.ts`, and MCP's
`plugins.has("webserver")` guard. Apply the explicit composition defaults described above
before registration, migrate A2A's inbound policy and advertising, and migrate ATProto's
web-presence consumer. Recheck eval compositions after removing the host-specific disable
entry: they must not bind sockets merely because routes remain registered.

Reject `plugins.webserver`. Test fixtures move the production port to `port:` and drop
unused preview/API port allocations; preview tests use Host headers on the shared port.
The `shell/app` override, entrypoint and package-ref tests that use `plugins.webserver` as
their sample plugin pick a plugin that still exists. Remove package dependencies, workspace
references and obsolete deployment port wiring along with the source package.

Tests, written first:

- Stale `plugins.webserver` and unknown `http.previewPort`/`http.apiPort` inputs are rejected
  with actionable errors; no canonical interface id is `webserver`.
- MCP HTTP mounts without a webserver plugin, explicit transport overrides win, and adding
  an unrelated site/webhook does not change MCP's transport.
- Core retains A2A outbound tools without inbound routes; explicitly enabled inbound A2A
  mounts and advertises its routes. Hosted and headless ATProto brain-card identity tests
  retain their existing URL/DID semantics.
- Boot smoke, git-broker recovery and import-burst tests pass using the production port.
- A packed external declarative interface mounts a route through the runtime host without
  CLI host injection or private package imports.
- Start a canonical posture through its existing `packages/brain-cli` script, request a
  rebuild through the running app's MCP command surface (`--remote`), and inspect the
  preview output first. Rebuild production separately and smoke both hostnames, clean URLs,
  images, blocked build metadata and health; preview must not expose plugin routes.

Run targeted package tests, typecheck and lint, then the cross-workspace architecture,
dependency and packed-contract checks required by the changed boundaries.

Docs in the same commit: `docs/interface-setup.md` (quick-reference row, Webserver section,
troubleshooting row), `docs/content-management.md` Studio paragraph, `shell/plugins/README.md`
transport list, the boundaries plan's remaining-packages list (27 tracked manifests, webserver
gone rather than converted, remeasured at cutover), the runtime configuration/deployment
references, and the roadmap entry for this plan.

## Implementation evidence

- `shell/http-host` owns serving; `shell/core/src/shell-http-host.ts` owns composition,
  acquisition, rollback, advertisements and cleanup. `interfaces/webserver` is deleted.
- Instance HTTP settings and static output declarations share schema-validated contracts in
  `shell/plugins`. Site-builder declares its resolved output; competing owners and conflicting
  explicit paths fail before binding. Normalized identical paths are accepted.
- Finalized routes/static output activate hosting. Worker, eval, register-only and startup-check
  never bind or create placeholders. Failed boot releases the port. Shutdown closes admission,
  drains for five seconds, then aborts request signals and sockets and joins admitted handler
  promises before releasing dependencies; uncooperative handlers can still delay shutdown.
- Canonical core/web protocol defaults, explicit overrides, route-only/static-only activation,
  non-default paths, port/advertising alignment, config rejection, hosted/headless discovery,
  composition introspection, rollback and streaming cancellation have focused regression tests.
- Full workspace tests (**100 tasks**), typecheck (**103 tasks**) and lint (**96 tasks**) pass;
  `arch:check`, `deps:check` (syncpack) and `docs:check` pass.
- Additional `test:scripts`: **80 pass, 0 fail**. With explicit approval, fixed the pre-existing
  dependency inventory findings (verified against base commit `42701668bd`): declared the
  missing workspace dependencies, routed the built-in chat REPL directly through the plugin
  framework instead of the SDK aggregation, and imported the entity test's `EvalHandler`
  from its owning plugin contract rather than AI-evaluation. No cycle suppression or legacy
  runtime behavior was introduced.
- Opt-in packed Phase 5 interface proof: **1 pass, 12 assertions**. Opt-in packed Phase 4 site
  proof: **1 pass, 13 assertions**, including its running-app rebuild.
- Opt-in packaged broker recovery: **4 pass, 30 assertions**. Its obsolete `wish:create`
  fixture now registers a dedicated test-only worker mutation, and its recurring-check lookup
  uses the converted service's qualified identity. No legacy runtime handler was restored.
- Opt-in import-burst soak: **12 pass, 51 assertions**, including four minutes of monitored
  two-CPU execution, no health failures, sustained CPU saturation, role loss or persistent
  zombies. The writer first incorporates the default identity exported during boot.
- Publishing smoke used `bun run start:publishing` with isolated port **19090**. Rebuilt
  **preview first, then production** through `build-site --remote` against the running app.
  Both `/posts` responses matched their app-generated HTML byte-for-byte; shared images and
  health returned 200, build metadata was hidden, and MCP OPTIONS returned 404 on preview
  versus 204 on production. Temporary config was restored and the app process group stopped.

## Out of scope

- Route authorization, matcher semantics and endpoint-advertisement drift stay with
  [http-route-registry-hardening](./http-route-registry-hardening.md). This plan moves the
  listener; it does not change what the listener admits.
- Merging site-builder's output configuration into the `http` section. Site-builder keeps
  writing where it writes; the host reads the same resolved values.
- The `web` bundle's remaining members and the bundle contract in
  [brain-model-unification](./brain-model-unification.md). Only the `webserver` row leaves.
