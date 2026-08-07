# API Stability

`brains` is in the **0.x** series. The general expectation is that breaking changes can land in any minor version (`0.1` → `0.2`) and that patch versions are reserved for bug fixes and additive changes. After `1.0`, semver applies normally.

This document defines what is considered stable enough that we'll try to preserve compatibility (or document migrations clearly) versus what is explicitly subject to change without notice. Use this to decide where it's safe to depend on internals and where it isn't.

---

## Stable surface — we'll try to preserve compatibility

These are the things you can build on with reasonable confidence. Breaking changes here will be called out explicitly in the changelog and, when possible, accompanied by a deprecation period.

### `brain.yaml` top-level schema

The top-level fields documented in [brain.yaml reference](../../packages/brain-cli/docs/brain-yaml-reference.md) are stable:

- `brain` — canonical alias or explicitly scoped external definition package
- `site` — site package override
- `name` — instance name
- `logLevel` — `debug | info | warn | error`
- `port` — server port
- `domain` — production domain
- `database` — connection string
- `bundles` — explicit fixed bundle selection
- `mode` — e.g. `eval`
- `add` / `remove` — plugin list deltas
- `admins` / `trusted` — permission-bearing user identifiers
- `anchors` — caller identities representing the brain's owner/subject
- `plugins` — per-plugin config map
- `permissions` — permission rules

Plugin-specific config schemas under `plugins.*` are owned by each plugin and stable separately (see "Per-plugin stability" below).

### System tool names and shapes

The system-level tools registered by `shell/core/src/system/` form the canonical entity API. The tool names and their input/output shapes are stable:

- `system_create` — create or AI-generate any entity using a canonical `source` selector (`text`, `generate`, `url`, `upload`, `attachment`, or `prior-response`), with confirmation flow
- `system_update` — modify entity fields, with confirmation flow
- `system_delete` — remove an entity, with confirmation flow
- `system_get` — retrieve by type and ID/slug/title
- `system_list` — list by type with filters
- `system_search` — semantic search across entities
- `system_status` — runtime status snapshot
- `system_insights` — aggregate insights

Old plugin-specific tool names (`blog_generate`, `note_create`, `deck_generate`, etc.) are gone and not coming back. Use the system tools.

### MCP resource URI scheme

The URI shapes exposed via MCP resources and resource templates are stable:

- `entity://types` — list of entity types
- `entity://{type}` — list of entities of a type
- `entity://{type}/{id}` — a specific entity
- `brain://identity` — brain character
- `brain://profile` — anchor profile
- `brain://status` — runtime status

### Entity frontmatter shape

The base entity frontmatter (`id`, `entityType`, `created`, `updated`, plus per-type fields) is stable. Per-type frontmatter schemas are owned by each entity plugin and stable separately.

The markdown body format is also stable: frontmatter delimited by `---`, then standard CommonMark.

### CLI command names

The `brain` CLI commands documented in the README are stable:

- `brain init <name>` — scaffold a new brain instance
- `brain start` — run the configured brain
- `brain list <entityType>` — list entities
- `brain get <entityType> <id>` — fetch an entity
- The `--remote <url>` flag and remote MCP resolution

Internal subcommands and flags not documented in the README are not stable.

### Public package authoring API

Stable external packages use generated declarative authoring subpaths:

- `@rizom/brain` for `defineBrain()`, `defineBundle()`, and `use()`;
- `@rizom/brain/entities` for entity packages and projections;
- `@rizom/brain/services` for services, tools, and durable jobs;
- `@rizom/brain/interfaces` for routes, daemons, and message interfaces;
- `@rizom/site` for site definitions and schema-first sections; and
- `@rizom/brain/plugins` only for nominated advanced shared contracts.

Each extension package default-exports one definition returned by its family helper. Config input and parsed callback config derive from one schema. Installed package metadata, capability scoping, registration, worker/web placement, rollback, and shutdown remain runtime-owned. Published declarations are generated from source and guarded against internal `@brains/*` imports.

Class-first plugin APIs, lifecycle subclasses, tuple factories, positional tools, root `z`, and `PLUGIN_API_VERSION` are removed alpha contracts and are not stable compatibility surfaces.

### External package loading shape

A brain-definition package imports extension defaults and configures them through typed `use()` references. Package versions live in package manifests, and every external package declares a compatible `@rizom/brain` peer range. The loader verifies that range and supplies installed name/version metadata.

The alpha `brain.yaml` shape `plugins.<id>.package`, default plugin functions, and named `plugin` factories are rejected with migration guidance. Stable instances select bundles and provide instance config; they do not load authoring factories from YAML.

### Definition and bundle API

`defineBrain()` and `defineBundle()` compose configured definition objects rather than string catalogs or constructors. Bundles reference configured members directly, while instance `brain.yaml` selects the resulting bundle IDs.

### License and provenance

AGPL-3.0-only for the core, Apache-2.0 for the SDK and contract packages, with author metadata in `package.json`. The license split itself is stable.

---

## Unstable surface — subject to change without notice

These are explicitly **not** stable. Don't depend on them without expecting churn. If you need to, vendor the relevant code or pin a specific version.

### Declarative callback expansion

Family helpers expose narrow contextual callback inputs for their documented capabilities. Additive callback expansion is still in progress. Depend on methods demonstrated by the standalone golden packages, not internal shell services or workspace-private context types.

Message transport SDK details, file-upload formatting, URL extraction, and URL-capture helper internals remain runtime or package-wrapper concerns rather than stable framework hooks.

Internal context factories and shell-only types remain unstable and are not public API:

- `createBasePluginContext`
- `createEntityPluginContext`
- `createServicePluginContext`
- `createInterfacePluginContext`
- `IShell`
- `PluginManager`
- `SYSTEM_CHANNELS`

### Internal services

Anything under `shell/*/src/internal/` is internal. Anything not exported from a package's index is internal. Anything with `Internal` in the type name is internal.

Examples of unstable internals:

- `entity-service` query builder internals, FTS scoring weights, embedding model choice
- `job-queue` storage schema and worker internals
- `messaging-service` topic naming conventions and message routing internals
- `ai-service` provider switching logic and prompt assembly
- `mcp-service` capability negotiation internals

### Log schema

The structure of log lines (JSON shape, field names, log levels) is **unstable**. Log content is for humans and ad-hoc debugging, not for parsing in production observability pipelines. If you want stable structured telemetry, build it on the messaging service or open an issue requesting a stable telemetry surface.

### Database schemas

Drizzle migrations under `shell/*/drizzle/` are managed by the framework. Don't read or write to the underlying SQLite tables directly — use the entity service. Schema changes are not breaking changes for users of the entity service API; they are absolutely breaking changes for anyone bypassing it.

### Embedding model choice

The default embedding model and its dimensions can change between minor versions. Embeddings are recomputed on demand from the source content; they're a derived cache, not source of truth.

### FTS scoring weights

The full-text-search ranking weights (title vs. body, recency boost, etc.) will change as we tune relevance. Don't write tests that assert specific result ordering for borderline matches.

### Internal config defaults

Defaults like cache sizes, debounce timings, batch sizes, retry counts — all subject to change as we tune performance. If you depend on a specific value, set it explicitly in `brain.yaml`.

### Build/dev tooling

The choice of Bun, Turborepo, Drizzle, Vercel AI SDK, etc. is implementation, not API. We may swap any of these. The `bun add -g @rizom/brain && brain init && brain start` workflow is stable; the underlying tools that implement it are not.

---

## Per-plugin stability

Each plugin in this repository owns its own stability story:

- **System tools** (`shell/core/src/system/`) — stable, see above
- **Built-in entity plugins** (`entities/*`) — frontmatter shape stable, internal generation logic unstable
- **Built-in service plugins** (`plugins/*`) — config schema stable per-plugin (documented in each plugin's README); internal behavior unstable
- **Built-in interface plugins** (`interfaces/*`) — protocol-level surface (MCP, A2A) stable; internal request handling unstable
- **`@rizom/brain/model`** — the canonical bundle contract is the built-in definition surface; recipe seed content remains illustrative and may change

For third-party plugins, follow the same convention: document what's stable in your plugin's README.

---

## Versioning policy

### Pre-1.0 (where we are now)

- **Patch** (`0.1.0` → `0.1.1`): bug fixes, additive changes that don't break existing usage, documentation, internal refactors
- **Minor** (`0.1.x` → `0.2.0`): may include breaking changes to anything in the "Stable surface" section, with migration notes in the changelog
- **Major** (`0.x` → `1.0.0`): the commitment that breaking changes to stable surface require a major bump

### Post-1.0 (future)

Standard semver:

- **Patch**: bug fixes, no API changes
- **Minor**: backward-compatible additions to stable surface
- **Major**: breaking changes to stable surface

The unstable surface is, as the name suggests, not bound by these rules — it can change in any release without bumping the corresponding component.

---

## How to read the changelog

Every release includes a changelog entry. Look for these labels:

- **Breaking** — something in the stable surface changed; migration notes included
- **Added** — new stable surface
- **Changed** — non-breaking changes to existing stable surface
- **Deprecated** — stable surface that will be removed in a future release; alternative provided
- **Removed** — previously deprecated surface that's now gone
- **Fixed** — bug fixes
- **Security** — security fixes (also published as advisories)

If you upgrade and something breaks that wasn't called out as Breaking, that's a bug — please file it.

---

## When in doubt

If you're not sure whether something you depend on is stable, open an issue and ask. The framework's API surface is finite enough that we can give you a definitive answer for any specific symbol or behavior.
