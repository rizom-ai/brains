# Plan: Note escalation

Last updated: 2026-11-15

## Status

Refining works through `system_generate` on every interface that reaches the brain's tools (chat, MCP, Studio's chat): one or more notes become one refined note, which is placed in a grouping where one applies, and the notes are removed. It is validated in the `personal` test app through chat. What remains is a select-and-refine action in Studio's library.

The shipped contract is documented in the [refined-note README](../../entities/refined-note/README.md), the [entity types reference](../entity-types-reference.md) and the [entity-service README](../../shell/entity-service/README.md).

## Goal

Notes come in two levels. A plain note is a loose capture in the root of the content directory. Escalating one or more plain notes produces a single worked-out note in its own folder and removes the notes it was written from. Over time the root empties and the folder holds the organized set.

## Decisions

- **Escalated notes are their own entity type, `refined-note`, in their own package.** Plain notes stay loose files in the root of the content directory; every other entity type gets a folder named after it (`plugins/directory-sync/src/lib/entity-paths.ts`), so refined notes live flat in `refined-note/<id>.md`. The folder shows the level; it has no subfolders. The type lives in `@brains/refined-note`, in the `core` bundle beside the notes: `@brains/note` is installed under a legacy plugin id that allows one entity type.
- **Required structure.** A refined note must have a stated `title` and a one-sentence `summary`. Where at least one grouping applies to `refined-note`, it must also carry at least one grouping membership; a brain with no applicable grouping asks for title and summary only. A refined note that does not meet this is refused at save, whoever writes it (refining, Studio, tools, directory-sync import). Refined notes saved before a grouping applied keep no membership until their next save.
- **Groupings carry the subject, not the file system.** `refined-note` is a `content` type with a frontmatter adapter, so it takes part in every grouping defined in Studio's `grouping-definitions` document by default. Studio's group views list refined notes beside the posts, decks and other entities with the same value. No grouping decides where a file is placed.
- **The brain writes the refined note.** Refining generates the title, summary and body from the root notes' text through the `refined-note:refinement` template. The result stands on its own and does not mention its sources.
- **The brain places it.** Where a grouping applies and what was written states no membership, the brain chooses one grouping and one value: one of the values a closed grouping allows, or a value an open grouping already holds or a new one. The direction the caller gave is read for where the note belongs. The caller does not pass memberships: a wrong placement is corrected in the note's properties afterwards.
- **Roots are removed right away, with no link back.** The refined note stores no reference to the notes it came from. The removed files remain only in the content repository's git history.
- **Two levels.** Only `note` entities can be refined. A refined note cannot be refined again or used as a root.
- **Visibility.** A refined note takes the most restrictive visibility among its roots.
- **No new tool.** Refining is `system_generate` with the `prompt-from-source` operation and `refined-note` as the target type. The operation takes further sources of the same type in `additionalSourceIds`, and its prompt is optional, serving as a direction for the writing when given.
- **Two general declarations carry the behavior.** `config.consumesSources` names the source types a type's generation uses up, and `config.requiresGroupingMembership` says its records must belong to a grouping where one applies. The runtime and `system_generate` act on them for any type; `refined-note` declares both.
- **Team brains.** A refined note is held to the note's action policy: Trusted creates and updates, Admin deletes. Refining removes notes, so on a team brain it needs Admin.

## Flow

Refining takes one or more source notes and an optional direction. It is the same on every interface and uses the generate tool's existing confirmation step.

1. A caller who may not delete notes gets the permission error that deleting a note gives today. Delete permission is decided per entity type and permission level, so it holds for all the chosen notes or for none.
2. Every id must name a `note` visible to the caller. Anything else is not found, with no sign of whether a hidden note exists, and nothing changes.
3. The brain asks one confirmation that names the notes and says they will be removed. Nothing is written or removed before the caller confirms.
4. On confirmation the brain generates title, summary and body from the roots, and chooses the grouping membership where one is required. A failed generation, or a placement the groupings refuse, writes nothing and leaves the roots.
5. The refined note is saved under a free title, like note generation today.
6. Each root is deleted. A delete that fails is an error: the refined note stays and the result names the roots that remain.

## Remaining

- **Refine from Studio's library.** Select one or more notes in the library and refine them, with the same confirmation. Studio's library has no multiple selection today and one primary action per page, so this starts from a reviewed mockup beside this plan.

## Validation

Checked in the `personal` test app through chat: refining two notes into one and refining a single note, the files under `refined-note/`, the notes gone from the root and kept in the content repository's history, and, with a closed Projects grouping defined, the value the brain chose written into the refined note's file.

Each change lands with its tests. Before the Studio action ships: refine from the library in the `personal` test app, and check the refined notes in a Studio group view beside another entity type with the same value.
