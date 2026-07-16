# Feature Overview

`brains` is a self-hosted AI knowledge system built around content you own. A brain can collect and search knowledge, help create new material, expose that knowledge to people and other agents, and publish selected content.

There is one configurable brain. Its features are composed from four plugin bundles:

| Bundle                        | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Core** (`core`)             | Knowledge, AI, storage, identity, operator tools, and agent networking that every brain can use |
| **Site** (`site`)             | A public website generated from the same content graph used by the brain                        |
| **Publishing** (`publishing`) | Content production and distribution across web, social, email, and AT Protocol channels         |
| **Team** (`team`)             | Shared conversation memory and a collaborator-friendly permission posture                       |

Each bundle is a tested combination of plugins, configuration defaults, and permission rules—not just a feature label. Bundles are independent where possible. In particular, **publishing does not require a website**: a brain can publish to external channels without enabling the Site bundle.

> **Current status:** `brains` is in the pre-stable `0.x` series. Core workflows are available, but configuration and extension APIs may still change between minor releases.

## Common bundle combinations

| Combination                  | What it provides                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **Core**                     | A private, searchable knowledge brain with operator tools and agent connectivity |
| **Core + Site**              | A knowledge brain with a public web presence                                     |
| **Core + Publishing**        | A content and distribution system without a public website                       |
| **Core + Site + Publishing** | A complete knowledge, website, and publishing system                             |
| **Core + Team**              | Shared team memory without a public website                                      |
| **Core + Site + Team**       | A collaborative knowledge hub with a public web presence                         |

Individual plugins can still be added, removed, or configured at the instance level.

## Core bundle

Core is the posture-independent foundation. It provides the knowledge system, AI runtime, identity and permissions, browser and platform chat, operator surfaces, file synchronization, and agent-to-agent connectivity.

### Core plugins

| Plugin             | User-facing capability                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`           | Editable prompts and generation instructions stored with the brain's content                                                             |
| `directory-sync`   | Bidirectional synchronization between the entity database and `brain-data/`, with optional Git pull, commit, history, and push workflows |
| `auth-service`     | First-run passkey registration, browser sessions, and OAuth authorization for compatible MCP clients                                     |
| `notifications`    | A shared notification layer for setup and operational messages                                                                           |
| `email-resend`     | Transactional email delivery through Resend when configured                                                                              |
| `mcp`              | MCP tools, resources, prompts, and resource templates over HTTP or stdio                                                                 |
| `webserver`        | Shared HTTP host for browser routes, APIs, MCP, A2A, static output, and `/health`                                                        |
| `web-chat`         | Operator browser chat with sessions, uploads, confirmations, sources, attachments, action cards, and job progress                        |
| `chat`             | One multi-platform Chat SDK interface for Discord and Slack adapters                                                                     |
| `a2a`              | Agent Card discovery, inbound A2A tasks, and outbound calls to peer agents                                                               |
| `dashboard`        | Tabbed operator console with extensible widgets, live system signals, action counts, and cross-surface navigation                        |
| `cms`              | Structured editing, AI-assisted review and rewriting, agent consultation, and plugin-provided workspaces                                 |
| `playbooks`        | Durable, stateful guided workflows with status, actions, evidence, and operator gates                                                    |
| Guided onboarding  | Optional first-run identity, profile, and knowledge-loop setup built on playbooks                                                        |
| `note`             | General Markdown notes and imported knowledge                                                                                            |
| `link`             | URL capture, extraction, and summaries                                                                                                   |
| `topics`           | Topic extraction and organization across source content                                                                                  |
| `image`            | Uploaded and AI-generated image assets, including cover images                                                                           |
| `document`         | Durable PDF files and generated document artifacts                                                                                       |
| `wishlist`         | Requests, ideas, and backlog items with status and priority                                                                              |
| `decks`            | Markdown presentations, AI generation, carousel/PDF output, and site routes when Site is enabled                                         |
| `agents`           | Saved or discovered peer brains and their advertised skills                                                                              |
| `assessment`       | Derived SWOT assessments from agent and skill evidence                                                                                   |
| `atproto-registry` | Serves canonical `ai.rizom.brain.*` lexicons and governance metadata on registry deployments                                             |

### Knowledge and storage

Durable content is stored as schema-validated Markdown with YAML frontmatter under `brain-data/`. Images and PDFs are stored as file entities. SQLite provides indexing, semantic search, jobs, and runtime state without replacing the portable content files.

Core supports:

- exact lookup, filtered lists, and semantic search;
- text, URL, previous-response, and upload capture;
- create, update, delete, generation, and extraction workflows;
- `public`, `shared`, and `restricted` content visibility;
- automatic indexing and embeddings;
- starter content on first boot;
- bidirectional file synchronization;
- optional Git-backed history and remote synchronization;
- background jobs with status and progress events.

### AI assistance

The agent can use the brain's content and tools to:

- answer questions from stored knowledge;
- find related notes, links, decks, and other entities;
- capture supplied material without converting it to a proprietary format;
- generate durable content from a prompt or an existing source;
- derive topics, skills, and SWOT assessments;
- generate images and covers;
- create or preserve PDF documents;
- report progress for longer-running work.

State-changing actions use a confirmation flow. In normal MCP mode, reads are exposed directly while writes and reasoning requests go through the brain's `chat` and `confirm` tools.

### Operator console

Core includes three coordinated browser surfaces:

- **Dashboard** — tabbed knowledge, publishing, site, network, and system views; live runtime activity; directory-sync status; semantic-index health; plugin digests; operator-attention counts; and endpoint links.
- **CMS** — schema-driven frontmatter and Markdown editing, unsaved-change safeguards, AI review/fact-check/rewrite actions on selected text, consultation with saved agents, and optional plugin workspaces.
- **Web chat** — persistent sessions and history, uploads, streaming responses, confirmations, sources, generated attachments, suggested actions, and background-job progress.

The shared console chrome includes responsive navigation and a command palette for jumping between surfaces and dashboard sections.

### Multi-platform chat

The `chat` interface replaces platform-specific chat plugins with one Chat SDK host. Discord and Slack adapters can run independently or together.

Current shared capabilities include:

- mentions, direct messages, channel allowlists, and mention requirements;
- subscribed-thread follow-ups with platform-isolated subscription state that survives restarts;
- URL capture and bot/self-message filtering;
- trusted/owner-only text, image, and PDF upload ingestion with follow-up reuse;
- native confirmation cards plus text confirmation fallbacks;
- suggested-action buttons with stale and replay protection;
- live tool status and background-job progress updates;
- visibility-checked delivery of generated images, PDFs, and text artifacts;
- platform-specific response chunking and `discord:*` / `slack:*` permission rules.

Discord supports gateway and webhook delivery. Slack supports a single workspace through either webhook or Socket Mode. Both adapters keep uploads and subscriptions isolated by platform.

### Agent network and discovery

Core can build and use a reviewable network of peer brains:

- verify and save a peer from its Agent Card before treating it as an approved contact;
- advertise this brain through an Agent Card and a public approved-agent directory;
- call approved peers over A2A and receive asynchronous A2A tasks;
- crawl approved peers' public directories one hop to record second-order sightings without auto-approving them;
- preserve who introduced each sighting and merge repeat sightings idempotently;
- visualize approved peers, semantic clusters, and relevant sightings in an interactive proximity map;
- grant or revoke inbound peer trust separately from outbound contact approval;
- sign trusted A2A requests with RFC 9421 HTTP Message Signatures and pin peer keys from JWKS;
- discover reviewable candidate brain cards from explicitly supplied AT Protocol repositories.

### Shared system tools

All content types use one consistent tool surface.

| Tool                | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `system_search`     | Semantic search across all or selected content types         |
| `system_get`        | Retrieve one item by id, slug, or title                      |
| `system_list`       | List a known content type with filters                       |
| `system_create`     | Save supplied text, a URL, an upload, or a prior response    |
| `system_generate`   | Generate content, images, covers, or derived media artifacts |
| `system_update`     | Change fields, visibility, status, or full content           |
| `system_delete`     | Delete an item when the caller has permission                |
| `system_extract`    | Run supported derivation workflows                           |
| `system_insights`   | Return aggregate content or plugin-provided insights         |
| `system_job_status` | Check progress and results for a background job              |
| `system_status`     | Report brain and service status                              |

### Core content types

| Content type    | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| Brain character | The brain's identity, role, purpose, and values                        |
| Anchor profile  | The person, team, or organization represented by the brain             |
| Prompt          | Editable generation and extraction instructions                        |
| Note            | General Markdown knowledge                                             |
| Link            | Captured web content and summaries                                     |
| Topic           | Derived themes across the knowledge base                               |
| Image           | Uploaded or generated visual assets                                    |
| Document        | Uploaded or generated PDF artifacts                                    |
| Wish            | Requested capabilities, ideas, and backlog items                       |
| Deck            | Presentation content and generated slide artifacts                     |
| Agent           | Saved or discovered peer brain                                         |
| Skill           | A capability advertised through agent discovery                        |
| SWOT            | A derived strengths, weaknesses, opportunities, and threats assessment |
| Playbook        | A durable guided workflow with states, actions, and completion gates   |

## Site bundle

The Site bundle turns the brain's content graph into a public website. It is independent from Publishing: a site can expose notes, links, docs, or team knowledge without enabling blog and distribution workflows.

### Site plugins

| Plugin or component | User-facing capability                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| `site-info`         | Site title, description, logo, theme mode, copyright, and calls to action |
| `site-builder`      | Static page generation from active content types and routes               |
| `site-content`      | Editable route and section copy stored as durable content                 |
| Theme wiring        | Reusable themes plus additive local CSS overrides                         |
| `analytics`         | Cloudflare pageviews, visitors, pages, referrers, devices, and countries  |
| Open Graph support  | Generated social-preview images and metadata for supported content        |
| `dashboard-root`    | Optional operator dashboard at the root route                             |

### Website features

- generated list and detail routes for enabled entity types;
- reusable Preact layouts, site packages, and themes;
- local theme and site composition overrides;
- editable site identity and section content;
- AI generation for all sections, one route, or one section;
- operator-triggered preview and production rebuilds;
- separate preview and production output;
- Markdown rendering and syntax highlighting;
- image extraction and asset handling;
- custom routes, navigation, templates, and static assets;
- `sitemap.xml` and `robots.txt` generation;
- serving through the brain's shared HTTP host.

### Site content types

| Content type     | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| Site information | Site-wide identity, metadata, theme mode, and calls to action |
| Site content     | Editable content for a specific route and section             |

## Publishing bundle

The Publishing bundle adds content production, scheduling, and external distribution. It can be combined with Site for web publishing or used independently for email, social, and AT Protocol distribution.

### Publishing plugins

| Plugin             | User-facing capability                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `blog`             | Generate, edit, schedule, and publish long-form posts                                                                                  |
| `series`           | Group related posts into ordered collections                                                                                           |
| `portfolio`        | Publish projects and case studies                                                                                                      |
| `content-pipeline` | Durable queues, scheduling, retries, generation schedules, and publishing operations                                                   |
| `social-media`     | Generate and publish LinkedIn text, image, and native PDF/document posts                                                               |
| `newsletter`       | Generate newsletters and manage Buttondown delivery and subscribers                                                                    |
| `stock-photo`      | Search and select Unsplash images                                                                                                      |
| `atproto`          | `did:web` identity, candidate brain-card discovery, and publication of brain cards and supported public entities to an AT Protocol PDS |

### Publishing workflows

- generate posts, newsletters, social posts, and portfolio projects from prompts;
- generate new material from an existing source entity;
- create social posts from posts or decks;
- publish LinkedIn text, image, and native PDF/document posts;
- generate and send newsletters through Buttondown;
- create cover images and select stock photography;
- render Open Graph images, printable PDFs, and deck carousel PDFs;
- add, remove, and reorder queued items;
- schedule publishing and recurring draft generation;
- retry failed publications;
- manage queue order, retries, source links, and confirmed direct publishing in the CMS Publishing workspace;
- inspect a compact publishing digest in the dashboard;
- expose `did:web` identity documents;
- discover reviewable candidate brains from AT Protocol repositories;
- publish supported public records through AT Protocol.

### Publishing content types

| Content type | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| Post         | Long-form article with draft, queued, published, and failed states |
| Series       | Ordered grouping of related posts                                  |
| Project      | Portfolio or case-study content                                    |
| Social post  | LinkedIn-ready text, image, or document post                       |
| Newsletter   | Email draft, schedule, and delivery record                         |

Decks and PDF documents remain in Core because they are general knowledge-work outputs. Publishing adds their distribution workflows, such as turning a deck into a LinkedIn document post.

## Team bundle

The Team bundle adds shared conversation memory and a trusted-collaborator permission posture. It does not create a separate kind of brain.

### Team plugins and posture

| Plugin or policy         | User-facing capability                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `conversation-memory`    | Durable conversation summaries, decisions, and action items with provenance                       |
| `docs`                   | Documentation pages for shared knowledge hubs                                                     |
| Shared visibility        | Team memory is stored with shared visibility by default                                           |
| Collaborator permissions | Trusted collaborators can create and update normal team-authored content                          |
| Owner controls           | Deletes, derived records, prompts, identity, and configuration remain owner-controlled by default |

### Team workflows

- project stored conversations into durable summaries;
- extract decisions and action items as first-class records;
- preserve conversation, space, participant, and time-range provenance;
- retrieve relevant memory from the current conversation space;
- opt into cross-space retrieval when broader context is needed;
- grant collaborator access through configured shared spaces;
- let collaborators create and update notes, links, docs, decks, decisions, and action items;
- keep destructive and system-maintained actions owner-controlled.

### Team content types

| Content type | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| Summary      | Narrative conversation memory                               |
| Decision     | Explicit decision with provenance and lifecycle status      |
| Action item  | Follow-up work with provenance and open/done/dropped status |
| Doc          | Documentation page for shared knowledge                     |

The Team bundle supplies a permission posture, not a complete multi-user account system. First-class user accounts, per-user state, and cross-interface identity linking are still in development.

## Optional authoring integration

| Capability       | How it fits                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `obsidian-vault` | Generated templates, file classes, Bases views, pipeline views, and singleton settings views |

## Interfaces

Interfaces can be enabled or removed independently from the content bundles where the instance permits it.

| Surface                 | User experience                                                                                      | Typical use                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Operator web chat       | Browser chat with sessions, uploads, confirmations, sources, attachments, action cards, and progress | Day-to-day operator interaction               |
| Platform chat           | One `chat` interface with independently configurable Discord and Slack adapters                      | Community, team, and operator chat            |
| CMS                     | Structured browser editing and plugin-provided workspaces                                            | Content and publishing operations             |
| Dashboard               | Extensible themed widgets grouped by concern                                                         | Status and operational overview               |
| MCP                     | HTTP at `/mcp` or local stdio                                                                        | Claude Desktop, Cursor, and other MCP clients |
| Terminal chat           | `brain chat` or `brain start --cli`                                                                  | Local conversation and testing                |
| Direct CLI tools        | Local `brain tool` calls or remote commands                                                          | Scripts, diagnostics, and operations          |
| A2A                     | Agent Card and JSON-RPC messaging                                                                    | Brain-to-brain communication                  |
| Public website          | Static pages generated from selected content                                                         | Public knowledge and publishing               |
| Direct files / Obsidian | Edit `brain-data/` with any text editor                                                              | Portable, local-first authoring               |

## Security and control

| Feature                 | Current behavior                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Operator authentication | First-run passkey registration, browser sessions, and optional setup-email delivery                                   |
| MCP authorization       | OAuth-capable clients can use the brain's OAuth flow; static bearer tokens remain a deprecated compatibility fallback |
| Caller roles            | `public`, `trusted` collaborator, and `anchor` owner/operator                                                         |
| Content visibility      | `public`, `shared`, or `restricted`; reads are scoped to the caller                                                   |
| Per-type actions        | Create, update, delete, extract, and publish thresholds can be `public`, `trusted`, `anchor`, or `never`              |
| Confirmation            | Mutating chat and MCP actions require explicit confirmation                                                           |
| Publishing control      | Publishing is a separate permission from ordinary editing                                                             |
| Secret handling         | Secrets live in environment or deployment configuration, not Markdown content                                         |
| Runtime separation      | Passkeys, OAuth state, jobs, and private runtime state stay outside Git-synced `brain-data/`                          |

## Integrations and bundle ownership

| Integration               | Owning bundle or scope | What it enables                                  | Common secret                                                       |
| ------------------------- | ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| AI provider               | Core                   | Chat, generation, extraction, and embeddings     | `AI_API_KEY`                                                        |
| Image provider            | Core                   | AI image generation                              | `AI_IMAGE_KEY`                                                      |
| Git host                  | Core                   | Private content-repository synchronization       | `GIT_SYNC_TOKEN`                                                    |
| Resend                    | Core                   | Setup and transactional email delivery           | `SETUP_EMAIL_API_KEY`                                               |
| Cloudflare Web Analytics  | Site                   | Website analytics                                | Cloudflare API token and site tag                                   |
| LinkedIn publishing       | Publishing             | Text, image, and native document publishing      | `LINKEDIN_ACCESS_TOKEN`                                             |
| LinkedIn portability      | Core (Rover)           | Consenting owner's PROFILE snapshot import       | `LINKEDIN_ACCESS_TOKEN` with `r_dma_portability_3rd_party`          |
| Buttondown                | Publishing             | Newsletter subscribers and delivery              | `BUTTONDOWN_API_KEY`                                                |
| Unsplash                  | Publishing             | Stock-photo search and selection                 | `UNSPLASH_ACCESS_KEY`                                               |
| AT Protocol / Bluesky PDS | Publishing             | Brain-card and entity publishing                 | `ATPROTO_APP_PASSWORD`                                              |
| Chat: Discord adapter     | Core (`chat`)          | Discord mentions, DMs, threads, files, and cards | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` |
| Chat: Slack adapter       | Core (`chat`)          | Slack mentions, DMs, threads, files, and cards   | `SLACK_BOT_TOKEN` plus `SLACK_APP_TOKEN` or `SLACK_SIGNING_SECRET`  |

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
- expose `/health` for containers and zero-downtime deployment checks.

Brains can run locally with Bun, in a container, or through the documented Kamal-based self-hosted deployment flow.

## Customization and extension

Most instances can be customized without creating a separate brain definition:

1. choose Core plus the Site, Publishing, and Team bundles needed by the instance;
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
- custom templates, data sources, dashboard widgets, CMS workspaces, site routes, and publishing providers.

## Current boundaries

The project does **not** currently claim to provide:

- a multi-tenant hosted SaaS platform;
- a complete first-class multi-user account system;
- generic autonomous-agent orchestration;
- provider-neutral web search;
- multi-workspace Slack OAuth or a hosted shared chat gateway;
- a fully stable plugin SDK before `1.0`.

## Read next

- [Getting Started](../packages/brain-cli/docs/getting-started.md)
- [Content Management](./content-management.md)
- [Interface Setup](./interface-setup.md)
- [Entity Types Reference](./entity-types-reference.md)
- [Customization Guide](./customization-guide.md)
- [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md)
- [Roadmap](./roadmap.md)
