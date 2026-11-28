---
title: "Feature Overview"
section: "Use a brain"
order: 10
slug: "feature-overview"
description: "What a brain does today, from knowledge and publishing to interfaces and integrations"
---

# Feature Overview

`brains` is a self-hosted AI knowledge system built around content you own. A brain can collect and search knowledge, help create durable material, expose that knowledge to people and other agents, and publish selected content.

There is one configurable brain. It composes from nine capability bundles plus the policy-only `team` bundle.

| Bundle       | Purpose                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `core`       | Identity, markdown knowledge, conflicts, Inbox, MCP stdio, A2A, and agent discovery                |
| `media`      | Durable documents and images                                                                       |
| `automation` | Playbooks and onboarding                                                                           |
| `web`        | HTTP, authentication, Admin, Dashboard, Studio, and the WebDAV drive                               |
| `chat`       | Platform chat, web chat and public Ask, email, notifications, conversation memory, and FAQ capture |
| `site`       | Public site information, content, building, forms, and analytics                                   |
| `publishing` | Blog, series, portfolio, decks, pipeline, social, newsletter, and stock-photo workflows            |
| `federation` | AT Protocol publication, and references to what other brains publish                               |
| `matrix`     | The brain's own Matrix homeserver at its domain                                                    |
| `team`       | Shared-memory and trusted-collaboration policy over members selected elsewhere                     |

Bundles contribute fixed members and bounded defaults. Instance-level `add`, `remove`, and `plugins` settings remain available for explicit tuning. Site and publishing are independent: external-channel publishing does not require a site.

> **Current status:** `brains` is in the pre-stable `0.x` series. Configuration and extension APIs may still change between minor releases.

## Reference postures

Recipes are scaffold-time conveniences. They emit explicit YAML and have no runtime meaning.

| Recipe         | Selection                                                                              |
| -------------- | -------------------------------------------------------------------------------------- |
| `headless`     | `core`                                                                                 |
| `personal`     | `core + media + web + chat`                                                            |
| `professional` | `core + media + automation + web + chat + site + publishing + federation`              |
| `team`         | `core + media + automation + web + chat + site + team`, plus `docs` and `action-board` |

No recipe selects `matrix`; add it to `bundles` to run the brain's own homeserver.

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

See [Content Management](/docs/content-management) and the [Entity Types Reference](/docs/entity-types-reference).

## Core

`core` needs no inbound listener or third-party account. It includes:

- brain and Anchor identity through `profile`, `prompt`, and `style-guide`;
- markdown vault synchronization through `directory-sync`;
- universal knowledge atoms through `note`, `refined-note`, `link`, and `topics`;
- the live operator-attention projection through `unified-inbox`;
- conflicts: an edit made over a newer version is kept as a `conflict` entry and shown in the Inbox until someone applies or dismisses it;
- MCP over stdio;
- outbound-capable A2A and agent-card construction;
- saved and discovered agents and skills.

A core-only brain is headless and private. It can call approved peers, but it serves no HTTP routes. Recurring-check failures remain visible through `inbox_list` even without a notification channel.

## Media and automation

`media` owns binary-backed `document` and `image` entities, including uploads, generated assets, covers, PDFs, and printable output.

`automation` owns playbooks and guided onboarding. A playbook is a stored, step-by-step workflow that runs inside a conversation; the Admin-only `playbook_manage` tool starts or resumes a run, reports its status, and advances it. `onboarding` ships the canonical onboarding playbook. Recipes omit automation where product maturity or posture does not justify it; plugins are not moved between bundles based on maturity.

## Web and chat surfaces

`web` owns the inbound HTTP surface:

- the runtime's shared HTTP host and health endpoints;
- passkey and OAuth authentication;
- Account and the Admin-only Administration pages, inside Studio;
- the public Dashboard;
- Studio, the authenticated workspace;
- the WebDAV drive;
- HTTP MCP publication.

Studio is organized in five sections: **Home**, the page it opens on, with what needs attention; **Library**, the content types in use; **Publish**, publishing workspaces; **Chat**; and **Brain**, the brain's own records and settings, including **History**, everything that happened in the last week. Sections appear only when a selected plugin contributes to them. See [Studio](/docs/studio).

The WebDAV drive serves the brain's entities on `/dav` as the same folders and files `brain-data/` holds, so GNOME Files, davfs2, rclone, macOS Finder, and Windows Explorer can mount it. People sign in with an app password created in Studio under Account → Drive. The [Rizom Brain plugin for Obsidian](https://github.com/rizom-ai/brains/blob/main/packages/obsidian-plugin/README.md) keeps a local vault in step with the brain through the drive. The drive is on whenever `web` is selected; `remove: [webdav]` turns it off. See [The Drive and Obsidian](/docs/drive-and-obsidian).

`chat` owns conversational channels:

- browser chat with sessions, uploads, confirmations, sources, and job progress;
- Discord, Slack, and Matrix adapters through one Chat SDK interface;
- email transport for setup links, invitations, and notifications, with an optional IMAP mailbox for inbound mail;
- notification delivery;
- conversation summaries, decisions, and action items, which stay in the Library;
- FAQ capture of reusable questions and answers.

The live Inbox remains core-owned. Dashboard is a web rendering and notifications are a chat delivery channel; neither owns the underlying projection. See [Interface Setup](/docs/interface-setup) for each channel.

### Public Ask

Visitors can ask the brain questions at `/ask` and, on sites that show it, from the homepage Ask box. Guest Ask stays off until the owner switches it on in Studio with a monthly budget; each guest question is screened against the site's public topics before it is answered. The `ask-content` entry holds the welcome copy and suggested questions ([details](https://github.com/rizom-ai/brains/blob/main/interfaces/web-chat/README.md)).

Other brains ask over A2A. Public A2A questions are bounded by `plugins.a2a.publicAsks`: daily question and answer-token limits per caller and for all public callers together, plus an `enabled` switch that refuses them all.

### Matrix

The `matrix` bundle runs a Matrix homeserver at the brain's own domain, where people sign in with their brain account and the brain talks as its bot. In a Kamal deploy, adding the bundle is the whole setup ([details](/docs/interface-setup#the-brains-own-homeserver)).

## Site and publishing

`site` builds an optional public web presence from `site-info`, `site-content`, a selected site package, and a selected theme, with content-defined forms and Cloudflare traffic analytics. Site output is app-managed: verify it by rebuilding through the running app before inspecting generated files.

`publishing` provides long-form and distribution workflows:

- posts, series, portfolios, and decks;
- generation and publication pipelines;
- social drafts and publication;
- newsletters and subscriber operations;
- stock-photo lookup and publish assets.

Site package, theme, represented identity, and seed content remain instance-owned choices. See the [Customization Guide](/docs/customization-guide) and [Theming Guide](/docs/theming-guide).

## Federation and agent networking

`federation` owns AT Protocol publication and references to what other brains publish. The canonical lexicon registry (`atproto-registry`) is outside every bundle: the one brain that is the lexicon authority adds it. The canonical A2A agent card is built from core identity and public skills; web and federation are publication channels above it.

Agent networking supports:

- saving and approving peers from verified Agent Cards;
- outbound A2A calls and inbound tasks when an inbound channel is active;
- signed trusted requests and pinned peer keys;
- reviewable second-order discovery;
- AT Protocol brain-card discovery and publication.

See [Agent Discovery](/docs/agent-discovery) and [ATProto Lexicons](/docs/atproto-lexicons).

## Team policy

`team` owns no members. It changes policy only while the targeted members are active:

- conversation memory becomes shared;
- cards tracked from the Inbox share the team's action-item visibility;
- topic extraction includes draft and published team material;
- trusted collaborators may create and update selected notes, refined notes, links, images, docs, decisions, and action items;
- HTTP MCP becomes Admin-only;
- team-specific agent instructions are added.

The team recipe explicitly adds `docs` and `action-board`, the shared Board where the team works the action items its conversations surface; assessment, decks, and other optional product capabilities remain visible opt-ins.

## Optional capabilities

These catalog members belong to no bundle and are selected with `add`:

| Member             | What it adds                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seminar`          | Seminars: `seminar_hold` puts one question to every approved peer brain and keeps their exchange, openings to closing, as a `seminar` entry. A live question about the peers' work goes to them, and each answer stays its author's. |
| `book`             | An author's works as read-only, citable books and sections; answers about the works cite the sections they draw on.                                                                                                                  |
| `docs`             | Documentation as first-class markdown `doc` entries.                                                                                                                                                                                 |
| `guides`           | Moving-in guides: walkthroughs for kinds of brain users.                                                                                                                                                                             |
| `email-workflows`  | Triage of the inbound mailbox: bulk mail is discarded, meaningful mail becomes a restricted `mail-item` in the Inbox, and the original stays in the mailbox.                                                                         |
| `action-board`     | The team's Board over action items, with blocked items in the Inbox and moves from chat.                                                                                                                                             |
| `contact`          | Private contact intake for the brain's public pages.                                                                                                                                                                                 |
| `quiz`             | Quizzes on the brain's site, with results kept as records.                                                                                                                                                                           |
| `assessment`       | Assessment outputs and capability-profile analysis.                                                                                                                                                                                  |
| `wishlist`         | Tracking of requests the brain could not fulfill.                                                                                                                                                                                    |
| `linkedin-import`  | Importing the owner's LinkedIn profile into the Anchor profile from Studio.                                                                                                                                                          |
| `oauth-broker`     | A managed OAuth broker: one central callback per provider, with one-time grants for instance brains.                                                                                                                                 |
| `atproto-registry` | The canonical AT Protocol lexicon registry, for the one brain that is the lexicon authority.                                                                                                                                         |

See [Seminars](/docs/seminars) for `seminar`, [Interface Setup](/docs/interface-setup#inbound-mail) for `email-workflows`, and [Publishing Integrations and Site Add-ons](/docs/publishing-integrations) for `contact`, `quiz`, `linkedin-import`, and `oauth-broker`.

## Shared system tools

| Tool                | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `system_search`     | Semantic search across selected content types    |
| `system_get`        | Retrieve one item by ID, slug, or title          |
| `system_list`       | List a known content type with filters           |
| `system_create`     | Save text, a URL, an upload, or a prior response |
| `system_generate`   | Generate content or media artifacts              |
| `system_update`     | Change fields, visibility, status, or content    |
| `system_delete`     | Delete an item when the caller has permission    |
| `system_analytics`  | Return aggregate content or plugin reports       |
| `system_job_status` | Check background-job progress and results        |
| `system_status`     | Report brain and service status                  |
| `inbox_list`        | Read the live operator-attention projection      |

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

## Operations and deployment

The bundle selection does not change the operational model. Every brain uses the same CLI and deployment paths.

The `brain` CLI can:

- scaffold a new instance;
- start the brain locally or with terminal chat attached;
- invoke tools locally or remotely;
- inspect search behavior and AI usage;
- run AI evaluation suites;
- preview offline migration of an old configuration;
- migrate, verify, and restore binary assets offline;
- reset operator passkeys through a local break-glass command;
- scaffold Docker, Kamal, and GitHub Actions deployment files;
- bootstrap Hetzner SSH keys and Cloudflare Origin CA certificates;
- push secrets to GitHub Actions or Bitwarden Secrets Manager;
- expose `/health/live` for container liveness and `/health/ready` for zero-downtime deployment checks.

Brains can run locally with Bun, in a container, or through the documented Kamal-based self-hosted deployment flow. Included integrations remain inactive until their required credentials are configured; the [brain.yaml Reference](/docs/brain-yaml-reference#integrations) lists them. See the [CLI Reference](/docs/cli-reference) and [Deployment Guide](/docs/deployment-guide).

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
([authoring guide](/docs/external-plugin-authoring),
[stable authoring ledger](https://github.com/rizom-ai/brains/blob/main/docs/public-release/AUTHORING_API_0.2.md)).

External authors can provide scoped definition packages, capability packages, interfaces, site packages, themes, and content definitions through the public `@rizom/brain` and `@rizom/site` contracts. External plugins are composed with `use()` in a scoped definition package, not loaded from `brain.yaml`. External packages do not inject canonical policy bundles.

## Current boundaries

- The product is one instance with multiple users, not multi-tenant SaaS.
- Site and theme packages are selected explicitly.
- Several integrations require external credentials and remain opt-in.
- The optional capabilities above stay outside every bundle unless a recipe or an explicit `add` selects them.

## Read next

- [Getting Started](/docs/getting-started)
- [brain.yaml Reference](/docs/brain-yaml-reference)
- [Brain Definition & Instance Architecture](/docs/brain-model)
- [External Package Authoring](/docs/external-plugin-authoring)
