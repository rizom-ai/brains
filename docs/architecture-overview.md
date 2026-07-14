# Architecture Overview

Brains is a modular, plugin-based system for running AI-powered knowledge agents. Each running brain is an independently deployable MCP server with its own identity, content, capabilities, and interfaces.

At a high level:

```text
brain model + brain.yaml instance config = running brain
```

- **Brain model** (`brains/*`) decides what capabilities exist
- **Instance config** (`brain.yaml`) provides environment-specific settings
- **Shell packages** provide the runtime, services, and plugin framework
- **Plugins** add content types, integrations, and interfaces

## Core architecture principles

1. **MCP-first** — every brain is an MCP server and exposes tools, resources, prompts, and resource templates through the same core transport model.
2. **Entity-driven** — durable content lives as typed entities stored as markdown with frontmatter.
3. **Schema-first** — Zod schemas define config, entities, tool inputs, and API contracts.
4. **Plugin-based** — almost all product behavior is composed from EntityPlugins, ServicePlugins, and InterfacePlugins.
5. **Brain model / instance separation** — reusable models live in `brains/`; running instances are lightweight directories centered on `brain.yaml`.
6. **Public API first** — external code should use the published `@rizom/brain/*` authoring APIs. Internal packages may use workspace packages, but should still avoid reaching into shell internals unless there is no supported boundary yet.

## Effect runtime boundary

The shell uses Effect for internal control-plane concerns where ownership and structured concurrency matter: transactional shell and plugin startup rollback, scoped resource finalization, daemon lifecycle, background monitors, worker and agent-turn fibers, cancellation, and concurrent lifecycle barriers.

The boundary is intentionally narrow:

- Public shell, plugin, daemon, and job APIs remain Promise-based.
- Cancellation crosses public boundaries as standard `AbortSignal`, not Effect types.
- Zod remains the schema and external contract system; Effect Schema is not used in parallel.
- Simple CRUD, validation, and synchronous registry operations should not be wrapped mechanically in Effect.
- Long-running work must be attached to an owning scope or supervised fiber; detached fibers require an explicit reason.
- Wrapping a Promise does not make its underlying operation cancellable. Cancellation-sensitive adapters must consume the signal supplied by Effect.
- Persistent jobs drain gracefully by default so interruption cannot abandon a claimed queue row.

This keeps Effect focused on runtime orchestration while preserving the stable authoring surface consumed by external plugins and brain packages. Shell packages import the curated private `@brains/effect-runtime` boundary rather than depending on Effect independently; deterministic test services use the boundary's `/test` subpath.

### Layer adoption

Effect `Layer` is adopted only for complete vertical slices. Wrapping process-global `getInstance()` calls in layers would hide singleton state, add a parallel dependency system, and risk changing registration and boot order.

The first layer-owned slice is the job-service stack. The private `@brains/job-queue/effect` subpath owns its `Context.Tag` contracts and scoped queue/runtime layers; core composes those layers across the package boundary instead of rebuilding job-queue lifecycle ownership locally. Separate runtime and database scopes preserve shutdown order: workers and cleanup fibers stop before plugin teardown, while the queue database remains available until dependent shell resources have closed. Existing Promise interfaces and dependency-injected test implementations remain unchanged, and Effect types do not cross the public authoring boundary.

Future layers must meet the same criteria:

1. construct fresh service instances without static singleton state;
2. use internal `Context.Tag` contracts without exposing Effect types publicly;
3. own acquisition and release through scoped layers;
4. replace the corresponding shell singleton resets and manual service finalizers; and
5. support test implementations through the existing dependency boundary.

### Runtime impact

The completed Effect hardening was measured against its pre-adoption merge base (`699aa9973`) using Bun 1.3.11. The bundled CLI grew from 7,510,645 to 7,795,413 bytes (+3.8%), or from 2,087,731 to 2,183,484 gzip bytes (+4.6%). Thirty interleaved fresh-process `brain --version` samples showed a median startup change from 430.5 ms to 434.5 ms (+4.0 ms, +0.9%) with a warm filesystem cache.

Building public library subpaths in one split graph then removed duplicate runtime code and source maps. The packed `@rizom/brain` artifact fell from the pre-Effect baseline of 16,477,259 bytes to 14,554,611 bytes (-11.7%); it had been 17,454,522 bytes before shared chunks. Effect therefore retains a measurable standalone CLI cost but no material process-startup regression in this benchmark, while the distributed package is smaller overall. Keep Effect internal and scoped to lifecycle/concurrency boundaries so future growth remains attributable to concrete runtime benefits.

## Workspace structure

The monorepo is organized into these main categories:

```text
shell/          Core runtime, services, plugin framework
shared/         Reusable utilities, themes, UI components, test helpers
entities/       EntityPlugin packages for content types
plugins/        ServicePlugin packages for tools and integrations
sites/          Structural site packages (routes, plugins, inherited composition)
interfaces/     InterfacePlugin packages for transports and daemons
brains/         Brain model packages
packages/       Standalone distributable packages (for example @rizom/brain)
```

A running brain is driven by an _instance directory_ centered on `brain.yaml` plus optional deploy/config files. The monorepo does not currently ship such instance directories; user instances are scaffolded outside the monorepo with `brain init`. Those generated instances also include support files such as `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, `src/site.ts`, and `src/theme.css` depending on model and options.

## Current package map

### Shell packages

| Package                      | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `shell/app`                  | Brain resolver, `defineBrain()`, instance loading, runtime bootstrap    |
| `shell/core`                 | Core shell, lifecycle orchestration, system tools/resources/prompts     |
| `shell/ai-service`           | AI querying, orchestration, provider abstraction                        |
| `shell/content-service`      | Template-based content generation support                               |
| `shell/conversation-service` | Conversation state and message history                                  |
| `shell/entity-service`       | Entity CRUD, indexing, search, embeddings                               |
| `shell/identity-service`     | Brain identity, anchor profile, URL derivation                          |
| `shell/job-queue`            | Background jobs, progress events, handler registration                  |
| `shell/mcp-service`          | MCP tool/resource/prompt/template registration                          |
| `shell/messaging-service`    | Typed event bus used across plugins                                     |
| `shell/runtime-state`        | Runtime state store service (`RuntimeStateService`/`RuntimeStateStore`) |
| `shell/plugins`              | Base plugin classes, contexts, harnesses                                |
| `shell/templates`            | Template registry and resolution                                        |
| `shell/ai-evaluation`        | Eval runner, test cases, judges, reporting                              |
| `shell/auth-service`         | Embedded OAuth metadata, JWKS, and auth route foundation                |

### Entity packages

Entity packages live in `entities/`. Most packages define one entity type; a few define more than one. Tightly coupled 1:1 entity + service capabilities may instead be compound packages under `plugins/`.

| Package                        | Entity type(s)                       | Notes                                               |
| ------------------------------ | ------------------------------------ | --------------------------------------------------- |
| `entities/blog`                | `post`                               | Essays, long-form publishing                        |
| `entities/decks`               | `deck`                               | Presentation/deck content                           |
| `entities/doc`                 | `doc`                                | Generic docs entity backing `/docs`                 |
| `entities/document`            | `document`                           | Generated PDFs and publishable document attachments |
| `entities/image`               | `image`                              | AI image generation                                 |
| `entities/link`                | `link`                               | URL capture and extraction                          |
| `entities/note`                | `note`                               | General markdown notes / notes                      |
| `entities/portfolio`           | `project`                            | Case studies and portfolio entries                  |
| `entities/products`            | `product`, `products-overview`       | Product catalog content                             |
| `entities/prompt`              | `prompt`                             | Editable AI prompt entities                         |
| `entities/series`              | `series`                             | Derived post grouping                               |
| `entities/site-info`           | `site-info`                          | Site metadata                                       |
| `entities/social-media`        | `social-post`                        | Social publishing content                           |
| `entities/conversation-memory` | `summary`, `decision`, `action-item` | Conversation memory                                 |
| `entities/topics`              | `topic`                              | Derived topic/tag entities                          |
| `entities/wishlist`            | `wish`                               | Unfulfilled requests / backlog                      |
| `entities/agent-discovery`     | `agent`, `skill`                     | Agent directory + discoverable skills               |
| `entities/assessment`          | `swot`                               | Derived assessment outputs                          |
| `entities/rizom-ecosystem`     | `ecosystem-section`                  | Rizom site ecosystem section content                |

### Service plugins

Service plugins live in `plugins/` and provide tools, handlers, routes, orchestration, or external integrations.

| Package                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `plugins/analytics`        | Analytics integration and insights                                 |
| `plugins/atproto`          | AT Protocol identity, publishing, discovery, feeds                 |
| `plugins/atproto-registry` | Canonical Rizom AT Protocol lexicon registry                       |
| `plugins/content-pipeline` | Publishing queue, scheduling, retries                              |
| `plugins/dashboard`        | Dashboard widgets and UI slots                                     |
| `plugins/directory-sync`   | File sync + git operations                                         |
| `plugins/email-resend`     | Generic email delivery adapter for Resend                          |
| `plugins/newsletter`       | Compound newsletter entity and Buttondown service capability       |
| `plugins/notifications`    | Notification routing for transactional and administrative messages |
| `plugins/obsidian-vault`   | Obsidian export/templates                                          |
| `plugins/site-builder`     | Static site build orchestration                                    |
| `plugins/site-content`     | Site section content generation                                    |
| `plugins/stock-photo`      | Stock-photo search and selection                                   |
| `plugins/cms`              | Browser authoring routes + CMS config                              |

### Interface plugins

Interface packages live in `interfaces/`. Some chat-style interfaces use `MessageInterfacePlugin`, which is a specialized interface base class for conversational transports.

| Package                | Purpose                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `interfaces/a2a`       | Agent-to-agent protocol, Agent Card, async tasks                                            |
| `interfaces/chat-repl` | Local chat REPL / development chat interface                                                |
| `interfaces/discord`   | Discord bot interface                                                                       |
| `interfaces/mcp`       | MCP transport over stdio and HTTP                                                           |
| `interfaces/web-chat`  | Bundled in-browser chat surface (default route `/chat`)                                     |
| `interfaces/webserver` | Browser-facing HTTP surface for site pages, dashboard/CMS routes, API routes, and `/health` |

### Sites, themes, and brains

| Area             | Current packages                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `sites/`         | `default`, `personal`, `professional`, `rizom` (site compositions; may inherit from other sites) |
| `shared/theme-*` | `note`, `default`, `rizom`                                                                       |
| `brains/`        | `rover`, `ranger`, `relay`                                                                       |
| `packages/`      | `brain-cli` (published as `@rizom/brain`), `brains-ops` (published as `@rizom/ops`)              |

## Plugin model

Brains uses three primary plugin categories:

- **EntityPlugin** — defines an entity schema, markdown adapter, optional generation handler, optional derivation logic, templates, and datasources.
- **ServicePlugin** — provides tools, jobs, API routes, orchestration, and external service integrations.
- **InterfacePlugin** — provides user-facing transports and long-lived daemons.

### EntityPlugin behavior

Entity plugins are the default way content enters the system.

They can automatically register:

- entity type + schema + adapter
- generation handlers (`{entityType}:generation`)
- templates
- site datasources
- explicit projection jobs declared by entity plugins

Entity plugins intentionally do **not** expose their own CRUD tools. Creation, update, deletion, and extraction flow through shared system tools like `system_create`, `system_update`, `system_delete`, and `system_extract`.

For creation, the standard pattern is:

1. `system_create` receives a normalized request
2. the target `EntityPlugin` may override `interceptCreate()`
3. the plugin either:
   - returns `handled` to fully own creation behavior, or
   - returns `continue` to fall back to the shared create flow
4. if the request includes a `prompt`, shared flow typically queues `{entityType}:generation`
5. otherwise shared flow performs a direct entity create

This is the canonical place for entity-specific create behavior such as URL capture, target resolution, deduplicating wishes, or enriching required metadata.

### ServicePlugin behavior

Service plugins provide the system's operational surface area:

- external integrations
- background job handlers
- publishing pipelines
- specialized tools such as sync, stock photo search, or analytics insights

### InterfacePlugin behavior

Interface plugins are how users or other agents interact with a brain:

- MCP clients connect through `interfaces/mcp`
- chat users connect through `interfaces/discord` or `interfaces/chat-repl`
- browsers connect through `interfaces/webserver` for public pages, dashboard/CMS routes, and browser-facing APIs
- peer agents connect through `interfaces/a2a`

## Operator browser state

Dashboard, CMS, and web-chat are separate applications with separate lifecycles. They do not share a mutable browser store:

- Dashboard stays server-rendered. Addressable tabs use the URL hash, request data stays request-owned, and transient enhancement state stays in the DOM.
- CMS and web-chat each own an unpersisted package-local TanStack Query client. Keys come from typed package-local factories, and mutations update or invalidate only related entries.
- The CMS query cache owns server snapshots while `editorWorkflowReducer` owns coordinated editor transitions. Cached snapshots and mutable drafts are separate; a background refresh cannot silently replace a dirty draft.
- The AI SDK `Chat`/`useChat` instance exclusively owns active and streamed chat messages. A history query may load an immutable snapshot, but reopening copies that snapshot into the AI SDK owner rather than sharing it.
- Addressable entity and conversation doors use URL hashes. Dialogs, panes, composer text, dirty drafts, and other transient state stay local.
- Cross-surface preferences remain framework-neutral localStorage helpers with browser events; query clients and mutable application caches are never shared across surfaces.

Package-specific key and invalidation rules are documented in the [CMS README](../plugins/cms/README.md) and [web-chat README](../interfaces/web-chat/README.md).

## Runtime flow

A typical boot sequence looks like this:

1. `@rizom/brain` or the in-repo runtime loads a `brain.yaml`
2. `shell/app` resolves the referenced brain model from `brains/*`
3. The shell constructs core services (entities, jobs, MCP, identity, messaging, AI)
4. Plugins are instantiated and registered in dependency order
5. Entity types, tools, resources, prompts, datasources, and daemons are registered
6. Interfaces start their long-lived processes
7. The brain begins serving MCP, web, Discord, A2A, or local chat traffic

## Entity model

All durable content follows the same base pattern:

```ts
{
  id: string;
  entityType: string;
  content: string; // markdown, usually with YAML frontmatter
  metadata: object; // query-friendly subset of structured data
  contentHash: string;
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
}
```

This makes it possible to share infrastructure across content types:

- one entity store
- one sync/export model
- one search pipeline
- one set of system CRUD tools
- one site-generation model

## Architectural boundaries

High-level dependency direction:

```text
brains/      -> entities/, plugins/, interfaces/, sites/, shared/
entities/    -> shared/, shell/plugins
plugins/     -> shared/, shell/plugins
interfaces/  -> shared/, shell/plugins
sites/       -> shared/, shell/*, other sites/ (explicit site composition and inheritance)
shell/       -> shared/, other shell/
```

Practical rule of thumb: external plugins should import from the public `@rizom/brain/*` authoring API instead of coupling directly to shell internals.

## Testing and quality

The project relies on:

- **Unit tests** with Bun
- **Plugin harnesses** for EntityPlugins, ServicePlugins, and InterfacePlugins
- **Mock helpers** from `@brains/test-utils`
- **Eval suites** for end-to-end agent behavior and multi-model comparisons
- **Type checking + linting** across the full monorepo via Turborepo

## Deployment model

Current deployment paths:

- **Local development** via Bun inside the monorepo
- **Published CLI** via `@rizom/brain`
- **Container deployment** for production brains
- **Kamal-based self-hosted deployments** as the default deploy path, including app-local deploy artifacts, env-schema generation, Cloudflare Origin CA bootstrap, and (optionally) `@rizom/ops`-managed multi-user fleets

Each deployed instance stays lightweight at the source level: a brain model package plus a lightweight instance package centered on `brain.yaml`.

## Where to read next

- [Roadmap](./roadmap.md)
- [Brain model guide](./brain-model.md)
- [Entity model](./entity-model.md)
- [Theming guide](./theming-guide.md)
- [External plugin authoring](./external-plugin-authoring.md)
- [Plugin quick reference](./plugin-quick-reference.md)
- [User-facing CLI docs](../packages/brain-cli/docs/getting-started.md)
