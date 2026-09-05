# Plan: the runtime owns its HTTP host

## Status

**Proposed.** Split out of [plugin-interface-boundaries](./plugin-interface-boundaries.md),
which found that `@brains/webserver` cannot be expressed on the declarative interface
contract because it _is_ the thing that contract delegates to. Nothing here has started.
This plan is sequenced after the plugin-authored interfaces in that tranche convert, since
it touches the bootloader and the CLI's brain model rather than plugin authoring.

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
  `outputDir`/`previewOutputDir`/`imagesDir`. Same three defaults, two schemas, no link.

`apiPort` in the webserver config is read by nothing but test fixtures; the standalone API
listener it once configured was removed by the route-registry hardening work.

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
sequence (before initial sync, web process role only), and shutdown stops it with the other
runtime services.

### When the host runs

The host starts when, after route finalization, **the route snapshot is non-empty or a site
is configured to be served**. Nothing else decides. This reproduces the current postures
without naming an interface:

| posture                                        | routes | site | host |
| ---------------------------------------------- | ------ | ---- | ---- |
| `core`, MCP over stdio                         | none   | no   | off  |
| `core` + `mcp` HTTP                            | `/mcp` | no   | on   |
| `web` bundle (dashboard, studio, admin)        | many   | no   | on   |
| `site` bundle (site-builder, no web interface) | none   | yes  | on   |
| chat only (Discord webhook)                    | one    | no   | on   |

The headless boot test already asserts `Production server listening` is absent from a
`core` brain's stderr; it keeps passing because a routeless, siteless brain starts no host.
MCP's `plugins.has("webserver")` guard is deleted: declaring the `/mcp` route is what makes
the host run, so the failure it guarded against cannot occur.

### Configuration

One runtime section replaces `plugins.webserver`:

```yaml
port: 8080 # production listener, unchanged knob, now the only one
http:
  preview: true # default: true when site-builder is active, else false
  previewPort: 4321
  productionDistDir: ./dist/site-production
  previewDistDir: ./dist/site-preview
  imagesDir: ./dist/images
```

`port` and `http.previewPort` are `deployment.ports.production` and `.preview`, which
already exist in `AppConfig`; the resolver stops writing a parallel `productionPort`. The
three directories default from site-builder's resolved config when it is active, so the
writer and the server agree by construction rather than by coincidence; a brain without
site-builder serves the placeholder from the defaults. `apiPort` is dropped. The resolver
rejects `plugins.webserver` with a message naming the `http` section, so a stale
`brain.yaml` fails at load rather than silently listening on defaults.

### What the plugin class did that the host keeps

- **Site and Preview endpoints and interactions.** The host registers `Site` (priority 10)
  when `domain` is set and `Preview` (priority 20, admin visibility) when preview is on,
  directly on the shell's endpoint and interaction registries. The dashboard's Endpoints
  card reads them as today.
- **Placeholder dist directories.** Created on start when absent, so a fresh brain serves a
  page before its first site build.
- **Health.** `/health/*` stays on the production surface, preview stays static-only, and
  the daemon-style `healthCheck` becomes a `runtime-health` contribution named `http-host`
  with the same running/URL details, next to `job-worker` and `attempt-leases`.

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

Each phase leaves every gate green and is one commit with its own changeset.

### 1. The host has a home

`shell/http-host` is created with `ServerManager`, `createApiRouteHandler`, the placeholder
template and all three webserver test suites, moved with imports repointed and nothing else
changed. `interfaces/webserver` imports from it. Arch rules admit `shell/http-host` and its
two Hono dependencies.

Tests: the moved suites pass under the new package; the webserver interface suite still
passes; `arch:check` and `deps:check` accept the new edge.

### 2. The shell starts it

`Shell` constructs `HttpHost` from a new `http` block on shell config, wired from
`deployment.ports` plus the directory defaults. `startEarlyWebserver` becomes
`startHttpHost` with the routes-or-site rule; shutdown stops it. The host registers Site
and Preview endpoints and interactions and contributes `http-host` health. The webserver
interface's `createDaemon` returns nothing and its `onRegister` no longer builds a
`ServerManager`, so exactly one listener exists during this phase.

Tests, written first: a bootloader test that a brain with one declared route starts the
host and a brain with none does not; a shell test that `port: 9000` binds 9000 and
advertises `http://localhost:9000`; endpoint registry shows Site and Preview from the host
alone; the headless boot test keeps asserting no listener line.

### 3. Nothing names webserver

Delete `interfaces/webserver`, its `canonical-brain.ts` entry, the definition-registry
injection, `webserverEnabled` and the `plugins.webserver` defaults in the resolver, the
`webserver` member and `evalDisable` entry in `canonical-bundles.ts`, and MCP's
`plugins.has("webserver")` guard. MCP's `transport` default derives from whether the host
will run, which the resolver already knows from the same routes-or-site facts. The resolver
rejects `plugins.webserver`. `http:` overrides land in `instance-overrides.ts`. Test
fixtures that set `plugins.webserver.*Port` move to `port:` and `http.previewPort`; the
`shell/app` override, entrypoint and package-ref tests that use `plugins.webserver` as their
sample plugin pick a plugin that still exists.

Tests, written first: resolver test that `plugins.webserver` is rejected with the new
section named; canonical-brain test that no interface id is `webserver`; MCP test that HTTP
transport no longer throws without a webserver interface; boot smoke, git-broker recovery
and import-burst tests pass on the moved port knobs.

Docs in the same commit: `docs/interface-setup.md` (quick-reference row, Webserver section,
troubleshooting row), `docs/content-management.md` Studio paragraph, `shell/plugins/README.md`
transport list, the boundaries plan's remaining-packages list (27 tracked manifests, webserver
gone rather than converted), and the roadmap entry for this plan.

## Out of scope

- Route authorization, matcher semantics and endpoint-advertisement drift stay with
  [http-route-registry-hardening](./http-route-registry-hardening.md). This plan moves the
  listener; it does not change what the listener admits.
- Merging site-builder's output configuration into the `http` section. Site-builder keeps
  writing where it writes; the host reads the same resolved values.
- The `web` bundle's remaining members and the bundle contract in
  [brain-model-unification](./brain-model-unification.md). Only the `webserver` row leaves.
