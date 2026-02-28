# Obsidian Integration — Opportunities

## Current Flow

```
Brains ↔ git-sync ↔ GitHub repo ↔ Obsidian vault
```

Bidirectional: edits in either direction flow through git. This works today.

## Opportunity 1: Content Creation Frontend

Obsidian is a better writing environment than a chat interface. Lean into this by making files created in Obsidian import cleanly into Brains without manual fixes.

### Template Sync

Export Brains templates as Obsidian templates (in the vault's template folder). Creating a note from template in Obsidian produces a file the brain can import correctly — right frontmatter fields, right folder, right naming.

### Shared Frontmatter Conventions

Document and enforce shared frontmatter fields so both systems agree on the schema:

- `status`: draft / published / archived
- `entityType`: inferred from folder, but can be explicit
- `title`, `slug`, `tags`: used by both systems
- `created`, `updated`: ISO timestamps

### Folder-as-EntityType

Already works (subdirectory = entity type). Could add a `README.md` per type folder explaining the schema and expected frontmatter, so Obsidian users know what fields to fill in.

## Opportunity 2: Obsidian Bases Integration

Obsidian Bases (`.base` files) provide database-like views over notes — tables, filters, sorts, grouping.

### Ship Base Files with the Vault

Include `.base` files that give useful views out of the box:

- **All Drafts**: Table of unpublished content across all entity types
- **Published Posts**: Blog posts with publish date, slug, tags
- **Recent Notes**: Notes sorted by last modified
- **Content by Tag**: Grouped view of all tagged content
- **Social Media Queue**: Upcoming social posts with status

### Base Generation from Brain

The brain could generate or update `.base` files during export to keep views current with registered entity types and their schemas.

## Opportunity 3: Sync Improvements

The current sync works but has room for improvement beyond just conflict resolution.

### Smarter Conflict Resolution

Current git-sync uses "ours" strategy (local wins), which can lose Obsidian edits. Improvements:

- **Timestamp-based merge**: Compare `updated` timestamps, keep the most recent
- **Field-level merge**: Merge frontmatter fields individually (Obsidian changed tags, Brains changed status — keep both)
- **Conflict surfacing**: On conflict, save both versions and notify the user via chat interface ("I found conflicting edits to 'Meeting Notes' — which version do you want?")

### Sync Reliability

- Better handling of concurrent edits (Obsidian autosave + brain processing simultaneously)
- Sync status visibility — which files are pending, which failed
- Partial sync recovery — resume from where it failed instead of re-syncing everything

### Sync Performance

- Incremental sync based on git diff rather than full directory scan
- Smarter debouncing — batch rapid changes instead of syncing each individually

## Opportunity 4: Obsidian Community Plugin

Build a lightweight Obsidian plugin that talks to the Brains shell via MCP HTTP transport. The plugin would be thin — MCP does the heavy lifting.

### Command Palette Integration

Add Obsidian commands that trigger brain tools:

- **Ask Brain**: Chat with the brain from inside Obsidian
- **Publish to Site**: Trigger site build for the current note
- **Generate Summary**: AI-summarize the current note
- **Create Social Post**: Generate a social media post from the current note

### Sidebar Chat Panel

A chat panel within Obsidian to interact with the brain without switching apps. Uses the same agent service that powers Matrix/Discord.

### Status Ribbon

Show brain connection status (connected/disconnected) and quick actions in the Obsidian status bar.

### Gutter Annotations

Show entity metadata inline — publish status, last sync time, or AI suggestions.

## Summary

| Priority | Opportunity               | Effort     | Depends On              |
| -------- | ------------------------- | ---------- | ----------------------- |
| 1        | Content creation frontend | Low        | Nothing — can start now |
| 2        | Bases integration         | Low-Medium | Nothing — can start now |
| 3        | Sync improvements         | Medium     | Nothing — can start now |
| 4        | Obsidian community plugin | High       | MCP HTTP transport      |
