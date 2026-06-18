# Rename `base` note entity to `note`

## Goal

Make the durable note entity consistently use `entityType: "note"` instead of the current `entityType: "base"`, without moving existing root-level markdown files in Git.

## Non-goals

- Do not rename generic architecture types such as `BaseEntity`, `BaseEntityAdapter`, or base plugin/job abstractions.
- Do not move root note files into a `note/` subdirectory.
- Do not add a long-lived legacy `base` alias unless a migration blocker appears.

## Plan

1. Change `@brains/note` to register and emit `entityType: "note"`.
2. Update shell/system tool validation, prompts, and upload-to-markdown extraction rules from `base` to `note`.
3. Keep directory sync semantics: root-level markdown files continue to be notes, now parsed/exported as `entityType: "note"`.
4. Update dependent integrations: CMS config, Obsidian vault base generation, site-builder exclusions, Relay/Rover brain config, topic extraction inputs, docs, evals, and tests.
5. Add automatic migration for existing local data:
   - `entities.entityType: "base" -> "note"`
   - `embeddings.entity_type: "base" -> "note"`
   - FTS rows if present: `entity_fts.entity_type: "base" -> "note"`
   - queued jobs where safe: `base:generation -> note:generation` and JSON payload references.
6. Validate with targeted typecheck/tests for note, entity-service, directory-sync, core system create/read paths, and affected brain tests.

## Expected compatibility behavior

Existing Git content remains in place. Existing DB rows are migrated forward. Calls that still use `entityType: "base"` after upgrade are expected to fail as unknown type; callers should use `entityType: "note"`.
