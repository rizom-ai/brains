# Plan: Generic Entity CRUD + Generate in System Plugin

## Context

Every content plugin reimplements the same CRUD boilerplate: `note_create`, `blog_create`, `link_capture`, etc. Each is ~50 lines doing the same thing — validate input, create entity, return result. Same for generate tools — take a prompt, call AI, create entity.

The entity service already handles CRUD generically. Move all basic entity operations to the system plugin. Keep plugin-specific tools only for domain logic (publish, capture, queue, etc.).

## Generic tools (system plugin)

- **`entity_create`** — create from provided content. Input: `entityType`, `content`, optional `id` + `metadata`.
- **`entity_generate`** — create via AI from a prompt. Looks up entity type's generation template from registry.
- **`entity_update`** — already planned in `entity-update-delete.md`. Diff confirmation.
- **`entity_delete`** — already planned in `entity-update-delete.md`. Title+preview confirmation.
- **`entity_list`** — rename from `system_list`
- **`entity_get`** — rename from `system_get`
- **`entity_search`** — rename from `system_search`

## What plugins keep

| Plugin           | Keeps                                 | Why                                |
| ---------------- | ------------------------------------- | ---------------------------------- |
| blog             | `blog_publish`, `blog_enhance-series` | Status change + event pipeline     |
| social-media     | `social-media_generate`               | Multi-platform routing, auto-queue |
| newsletter       | `newsletter_send`                     | Buttondown API integration         |
| content-pipeline | `pipeline_publish`, `pipeline_queue`  | Orchestration + scheduling         |
| link             | `link_capture`                        | URL fetching + AI extraction       |
| directory-sync   | `sync`, `git_sync`, `git_status`      | File system + git ops              |

## What plugins lose

- `note_create`, `note_generate`
- `blog_create`, `blog_generate`
- `portfolio_create`
- `wishlist_add`
- Any other plugin's basic create/generate tool

## Steps

1. Add `entity_create` and `entity_generate` to system plugin (tests first)
2. Rename `system_list/get/search` → `entity_list/get/search`
3. Remove CRUD boilerplate from content plugins
4. Update plugin tests

## Prerequisites

- `entity-update-delete.md` plan lands first (update + delete with confirmations)
- Then this plan adds create + generate + renames

## Verification

1. `entity_create { entityType: "base", content: "# My Note" }` → works
2. `entity_generate { entityType: "post", prompt: "write about AI" }` → AI generates + creates
3. All existing plugin-specific tools still work
4. Removed tools no longer appear in MCP tool list
