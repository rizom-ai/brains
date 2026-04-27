# Relay seed content

This directory contains the first-boot starter content for `@brains/relay`.

## What it is for

The files here give a new relay instance enough durable markdown content to boot with a coherent identity and a usable starting structure.

Included content typically covers:

- `brain-character/` — the brain's identity and operating voice
- `anchor-profile/` — the operator or owner profile
- `site-info/` — site title, metadata, and presentation defaults
- `deck/` — example deck content
- root `.md` files — supporting reference material

## How it is used

On first boot, if `brain-data/` is empty, relay copies this seed content into the instance content directory.

After that:

- edit the instance's `brain-data/` content, not this directory
- treat markdown files as the durable source of truth
- let the runtime index that content into SQLite for search and retrieval
- optionally sync the same markdown content to git through `directory-sync`

## Authoring notes

- Keep content markdown-first and entity-shaped
- Prefer durable editorial copy over temporary scaffolding text
- Use frontmatter that matches the owning entity schema
- Keep examples realistic but clearly starter-level

## Related docs

- [Relay model README](../README.md)
- [Repository README](../../../README.md)
- [Brain model architecture](../../../docs/brain-model.md)
- [AGENTS.md](../../../AGENTS.md)
