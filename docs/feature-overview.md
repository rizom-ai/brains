# Feature Overview

`brains` is a self-hosted AI knowledge system built around content you own. A brain can collect and search knowledge, help create durable material, expose that knowledge to people and other agents, and publish selected content.

There is one configurable brain. It composes from eight capability bundles plus the policy-only `team` bundle.

| Bundle       | Purpose                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `core`       | Identity, markdown knowledge, Inbox, MCP stdio, A2A, and agent discovery                |
| `media`      | Durable documents and images                                                            |
| `automation` | Playbooks and onboarding                                                                |
| `web`        | HTTP, authentication, account/admin, Dashboard, and Studio                              |
| `chat`       | Platform chat, web chat, email, notifications, and conversation memory                  |
| `site`       | Public site information, content, building, and analytics                               |
| `publishing` | Blog, series, portfolio, decks, pipeline, social, newsletter, and stock-photo workflows |
| `federation` | AT Protocol publication and registry capabilities                                       |
| `team`       | Shared-memory and trusted-collaboration policy over members selected elsewhere          |

Bundles contribute fixed members and bounded defaults. Instance-level `add`, `remove`, and `plugins` settings remain available for explicit tuning. Site and publishing are independent: external-channel publishing does not require a site.

> **Current status:** `brains` is in the pre-stable `0.x` series. Configuration and extension APIs may still change between minor releases.

## Reference postures

Recipes are scaffold-time conveniences. They emit explicit YAML and have no runtime meaning.

| Recipe         | Selection                                                                 |
| -------------- | ------------------------------------------------------------------------- |
| `headless`     | `core`                                                                    |
| `personal`     | `core + media + web + chat`                                               |
| `professional` | `core + media + automation + web + chat + site + publishing + federation` |
| `team`         | `core + media + automation + web + chat + site + team`, plus `docs`       |

## Durable knowledge

Durable content is schema-validated Markdown with YAML frontmatter under `brain-data/`. Images and PDFs are file entities. SQLite provides indexing, semantic search, jobs, conversations, auth, and runtime state without replacing the portable content files.

Common capabilities include:

- exact lookup, filtered lists, and semantic search;
- text, URL, previous-response, and upload capture;
- public, shared, and restricted visibility;
- create, update, delete, generation, and extraction workflows;
- first-boot seed content;
- bidirectional directory synchronization;
- optional Git history and remote synchronization;
- background jobs with status and progress events.

## Core

`core` needs no inbound listener or third-party account. It includes:

- brain and Anchor identity through `profile`, `prompt`, and `style-guide`;
- markdown vault synchronization through `directory-sync`;
- universal knowledge atoms through `note`, `link`, and `topics`;
- the live operator-attention projection through `unified-inbox`;
- MCP over stdio;
- outbound-capable A2A and agent-card construction;
- saved and discovered agents and skills.

A core-only brain is headless and private. It can call approved peers, but it serves no HTTP routes. Recurring-check failures remain visible through `unified-inbox_list` even without a notification channel.

## Media and automation

`media` owns binary-backed `document` and `image` entities, including uploads, generated assets, covers, PDFs, and printable output.

`automation` owns playbooks, playbook execution, and guided onboarding. Recipes omit automation where product maturity or posture does not justify it; plugins are not moved between bundles based on maturity.

## Web and chat surfaces

`web` owns the inbound HTTP surface:

- shared webserver and health endpoints;
- passkey and OAuth authentication;
- Account and Admin consoles;
- Dashboard operator views;
- Studio entity editing and plugin workspaces;
- HTTP MCP publication.

`chat` owns conversational channels:

- browser chat with sessions, uploads, confirmations, sources, and job progress;
- Discord and Slack adapters through one Chat SDK interface;
- email transport;
- notification delivery;
- conversation summaries, decisions, and action items.

The live Inbox remains core-owned. Dashboard is a web rendering and notifications are a chat delivery channel; neither owns the underlying projection.

## Site and publishing

`site` builds an optional public web presence from `site-info`, `site-content`, a selected site package, and a selected theme. Site output is app-managed: verify it by rebuilding through the running app before inspecting generated files.

`publishing` provides long-form and distribution workflows:

- posts, series, portfolios, and decks;
- generation and publication pipelines;
- social drafts and publication;
- newsletters and subscriber operations;
- stock-photo lookup and publish assets.

Site package, theme, represented identity, and seed content remain instance-owned choices.

## Federation and agent networking

`federation` owns AT Protocol publication and canonical lexicon registry capabilities. The canonical A2A agent card is built from core identity and public skills; web and federation are publication channels above it.

Agent networking supports:

- saving and approving peers from verified Agent Cards;
- outbound A2A calls and inbound tasks when an inbound channel is active;
- signed trusted requests and pinned peer keys;
- reviewable second-order discovery;
- AT Protocol brain-card discovery and publication.

## Team policy

`team` owns no members. It changes policy only while the targeted members are active:

- conversation memory becomes shared;
- topic extraction includes draft and published team material;
- trusted collaborators may create and update selected notes, links, images, docs, decisions, and action items;
- HTTP MCP becomes Admin-only;
- team-specific agent instructions are added.

The team recipe explicitly adds `docs`; assessment, decks, and other optional product capabilities remain visible opt-ins.

## Shared system tools

| Tool                 | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `system_search`      | Semantic search across selected content types    |
| `system_get`         | Retrieve one item by ID, slug, or title          |
| `system_list`        | List a known content type with filters           |
| `system_create`      | Save text, a URL, an upload, or a prior response |
| `system_generate`    | Generate content or media artifacts              |
| `system_update`      | Change fields, visibility, status, or content    |
| `system_delete`      | Delete an item when the caller has permission    |
| `system_insights`    | Return aggregate content or plugin reports       |
| `system_job_status`  | Check background-job progress and results        |
| `system_status`      | Report brain and service status                  |
| `unified-inbox_list` | Read the live operator-attention projection      |

State-changing actions use confirmation and permission checks. Reads and writes are visibility-aware.

## Security and control

- Caller levels are Public, Trusted, Admin, and Anchor.
- Exact principals and shared spaces are instance-owned configuration.
- Entity actions are independently permissioned for create, update, delete, extract, and publish.
- Publishing cannot be less restrictive than updating.
- HTTP MCP defaults Public when `web` is selected; team policy narrows it to Admin.
- MCP stdio and CLI commands default Admin.
- Secrets remain environment-backed and can be referenced as `${NAME}` in YAML.
- A removed member contributes no bundle config, permissions, instructions, or eval exclusions.

## Operations and extension

The CLI supports scaffolding, startup checks, diagnostics, offline config migration, certificate bootstrap, secret delivery, and Kamal deployment scaffolding. The runtime exposes health and operator surfaces through selected bundles only.

Included integrations remain inactive until their required credentials are configured. Keep non-secret settings in `brain.yaml` and secrets in environment-backed configuration.

## Operations and deployment

The bundle selection does not change the operational model. Every brain uses the same CLI and deployment paths.

The `brain` CLI can:

- scaffold a new instance;
- start the brain locally or with terminal chat attached;
- invoke tools locally or remotely;
- inspect search behavior and AI usage;
- run AI evaluation suites;
- reset operator passkeys through a local break-glass command;
- scaffold Docker, Kamal, and GitHub Actions deployment files;
- bootstrap Hetzner SSH keys and Cloudflare Origin CA certificates;
- push secrets to GitHub Actions or Bitwarden Secrets Manager;
- expose `/health/live` for container liveness and `/health/ready` for zero-downtime deployment checks.

Brains can run locally with Bun, in a container, or through the documented Kamal-based self-hosted deployment flow.

## Customization and extension

Most instances can be customized without creating a separate brain definition:

1. choose the capability bundles needed by the instance;
2. add or remove individual plugins at the edges;
3. configure plugins in `brain.yaml`;
4. edit identity, prompts, profile, and content in `brain-data/`;
5. layer local theme CSS over a built-in theme;
6. compose custom site routes and layouts;
7. add external entity, service, or interface plugins when new behavior is required.

The plugin system supports:

- **Entity plugins** for schema-validated, Markdown-backed content types;
- **Service plugins** for tools, jobs, integrations, API routes, and automation;
- **Interface plugins** for user and agent transports;
- custom templates, data sources, site routes, and publishing providers.

External service packages can declare encrypted per-account settings,
Dashboard widgets, and authenticated Studio workspaces through the public `0.2.x`
authoring API. Widgets and workspaces return closed semantic views rendered by
the host; packages do not ship browser components, HTML, CSS, scripts, renderer
names, or private routes. Typed query state, dynamic catalogs, workspace
actions, and prepared confirmations cover the current first-party surfaces
([authoring guide](external-plugin-authoring.md),
[stable authoring ledger](public-release/AUTHORING_API_0.2.md)).

External authors can provide scoped definition packages, capability packages, interfaces, site packages, themes, and content definitions through the public `@rizom/brain` and `@rizom/site` contracts. External packages do not inject canonical policy bundles.

## Current boundaries

- The product is one instance with multiple users, not multi-tenant SaaS.
- Site and theme packages are selected explicitly.
- Several integrations require external credentials and remain opt-in.
- Opportunity prioritization, LinkedIn import, OAuth broker, assessment, wishlist, docs, Obsidian sync, and email workflows remain outside default bundles unless selected by a recipe or explicit addition.

## Read next

- [Getting Started](../packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
- [Brain Definition & Instance Architecture](./brain-model.md)
- [External Plugin Authoring](./external-plugin-authoring.md)
