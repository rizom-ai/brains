# Plan: User-Facing Documentation

## Context

The repo now has a real base layer of user-facing documentation: getting started, CLI reference, brain.yaml reference, deployment guidance, theming docs, and architecture docs all exist.

What is still missing is a more complete and better-organized user-facing docs set for people who are not already familiar with the repo.

That means this is no longer about creating docs from zero. It is about closing the remaining gaps before and after Rover 1.0.

## What's needed

### Getting Started

1. **What is a brain?** — one-paragraph explanation, what it does, who it's for
2. **Quick start** — `brain init mybrain && cd mybrain && brain start` (3 commands to running brain)
3. **Prerequisites** — Bun, API keys, Git (for content sync)

### Configuration

1. **brain.yaml reference** — every field explained with examples
2. **Presets** — what core/default/full include
3. **Plugin config** — how to configure individual plugins (directory-sync git URL, site-builder theme, etc.)
4. **Secrets / .env** — which API keys are needed and where to get them

### Content Management

1. **Entity types** — what's a post, note, link, deck, etc.
2. **Creating content** — via chat, via CMS, via markdown files
3. **Prompts** — how to customize AI generation prompts
4. **Seed content** — how first-run content works

### Deployment

1. **Local development** — `brain start` from monorepo and from standalone instance dirs
2. **Docker** — build and run with Docker where still relevant
3. **Standalone deploy flow** — `brain init --deploy`, bootstrap commands, publish/deploy workflows
4. **Custom domain** — how to add your own domain

### Interfaces

1. **MCP** — connect to Claude Desktop or other MCP clients
2. **Discord** — set up Discord bot
3. **CLI** — `brain` command reference
4. **A2A** — agent-to-agent communication
5. **Web** — static site + CMS

### Customization

1. **Themes** — how to create/customize themes
2. **Layouts** — how to create custom layouts
3. **Plugins** — how to write an EntityPlugin or ServicePlugin (link to the existing plugin AGENTS.md files)

## Format

Static site at `docs.rizom.ai` or section on `rizom.ai`. Built from markdown files in the monorepo. Could use:

- **Astro Starlight** — purpose-built for docs
- **VitePress** — Vue-based, fast
- **Just markdown** — rendered by the brain's own site builder

The brain's site builder is the obvious choice if it can handle a docs layout. Otherwise, a dedicated docs tool.

## Naming cleanup

The codebase has 60+ references to "Personal Brain" or "personal knowledge" — a holdover from when the system was single-user only. It now supports personal (Rover), team (Relay), and collective (Ranger) brains. All references to "Personal Brain" should be replaced with just "Brain" or "Brains" throughout code, docs, READMEs, package descriptions, and comments. This is a prerequisite for 1.0 — the product shouldn't describe itself inaccurately.

## Steps

### Phase 0: Naming cleanup — DONE (2026-03)

Replaced "Personal Brain" across 60+ files. Updated package.json descriptions, READMEs, docs, source code, placeholder HTML. Deleted 4 obsolete deployment docs.

### Phase 1: Essential docs — DONE (2026-03)

Docs in `docs/`:

1. Getting started guide
2. brain.yaml reference
3. CLI command reference
4. Deployment guide (Docker + Kamal)

### Phase 2: Complete docs

1. Entity types reference
2. Content management guide
3. Interface setup guides (MCP, Discord, A2A)
4. Customization guides (themes, layouts, plugins)

### Phase 3: Doc site

1. Choose doc framework
2. Deploy at docs.rizom.ai
3. Auto-generate CLI reference from code
4. Auto-generate brain.yaml schema reference from Zod schemas

## Verification

1. New user can go from zero to deployed brain following the getting started guide
2. brain.yaml reference covers every field with examples
3. Deployment guide works on a fresh Hetzner VPS
4. CLI reference matches actual commands
