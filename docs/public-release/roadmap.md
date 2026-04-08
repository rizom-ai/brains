# Roadmap

This is a public, high-level view of where `brains` is headed. Items are roughly ordered by priority but not strictly by date — actual landing depends on maintainer availability.

For what's already shipped, see [CHANGELOG.md](./CHANGELOG.md).
For what's stable today versus what isn't, see [STABILITY.md](./STABILITY.md).

> **Note on planning:** this project is in maintainer-only development mode. Items below are intentions, not commitments. The roadmap can and will change. If something here is important to you, open an issue in the main repository to bump its visibility.

---

## In progress

These are actively being worked on and likely to land in the next minor release.

- **External plugin API** — public, documented plugin API with `.d.ts` exports, runtime loading from `brain.yaml`, an API version contract, and a `brain add <plugin>` CLI. Enables building plugins without forking the framework.
- **Kamal deployment** — replace the current Terraform + SSH + Caddy recipe with a Kamal-based deploy flow. Aim is to make `brain deploy` a one-command experience for new users.

## Planned — short term

Things we want before `v0.5` or so. Order within this list is rough.

- **AT Protocol integration (phases 1–2)** — DID identity (`did:web`), outbound publishing of entities to a personal data server, Bluesky cross-posting. Gives brains a presence on the AT Protocol network.
- **Eval coverage expansion** — broader and deeper test cases for the eval suite, more entity types covered, multi-model comparison runs.
- **Composite plugins refinements** — based on usage of the existing composite plugin pattern (newsletter+buttondown is the reference), more bundled patterns where they make sense.
- **Documentation phase 2** — tutorials for common patterns: building a custom entity, building a custom service plugin, deploying to alternative providers.

## Planned — medium term

Larger pieces that require design work first.

- **Chat SDK migration** — replace the Discord-specific interface with a unified chat interface built on the Vercel Chat SDK. One transport, multiple frontends.
- **AT Protocol (phases 3–6)** — inbound ingestion, decentralized agent discovery, cross-brain feeds, ambient federation. Replaces manual agent card fetching with firehose-driven discovery.
- **A2A authentication phase 2+** — OAuth 2.0 client credentials flow, then mTLS for higher-trust deployments.
- **Multi-user and permissions** — first-class user entities with cross-interface identity (Discord IDs, DIDs, emails mapped to brain-level users with roles). Enables team brains and richer permission models. Backward compatible — single-owner brains stay simple.
- **Local AI runtime** — separate process for embedding generation, text generation, and image processing. Brains run with zero API keys, fully offline. Enables cheap hosted deployments and desktop apps.
- **Compiled binaries** — standalone executables via `bun build --compile`. Alternative to npm install for users who don't want a Bun/Node runtime on their machine.
- **Site builder decoupling** — extract the static site builder into a renderer-agnostic engine. The plugin becomes a thin orchestration layer over the engine. Prerequisite for the long-term Astro migration.
- **Search reranking** — cross-encoder re-scoring on top of the current FTS5 + vector hybrid. Depends on local AI runtime to be cost-effective.
- **Monitoring post-release** — health dashboard, log aggregation, alerting, fleet view. Builds on the structured logging and enriched `/health` already shipped.

## Planned — long term

Big bets that will take significant work and aren't on a near-term schedule.

- **Astro migration** — replace the current Preact-based site builder with Astro behind the renderer-agnostic engine interface. Better content collections, island architecture, native Tailwind + image optimization. Depends on site-builder decoupling.
- **Desktop app** — native desktop application built on a Bun-native framework. Brain runs as the main process. Tray icon, embedded CMS, optional chat, no external server required.
- **Browser dashboard** — richer web UI beyond the static site, for users who want to manage their brain through a browser instead of an editor or chat.
- **Obsidian plugin** — chat, publish, and generate from inside Obsidian via MCP-over-HTTP.

---

## Things explicitly **not** on the roadmap

To set expectations:

- **Hosted "brains as a service."** We're not building a SaaS. The framework is the product.
- **Multi-tenant deployment.** One brain per process. Team brains are deployed once and accessed by many; that's not the same as multi-tenancy.
- **Generic agent framework.** The opinionated entity model is the point. If you want a generic agent framework, use one of those.
- **Closed-source extensions.** Everything in this repository is and will remain Apache-2.0. No "enterprise edition."

---

## How priorities get set

This is a solo-maintained project. Priority order is roughly:

1. Things that block the project from being usable (correctness, security)
2. Things many users have asked for (tracked via GitHub issues)
3. Things that unblock other things on the roadmap
4. Things the maintainer finds interesting and tractable

If you want to influence priority: file an issue, describe the use case, and explain why the current state doesn't work for you. Concrete cases beat abstract requests.
