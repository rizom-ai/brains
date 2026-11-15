# Plan: Note escalation

Last updated: 2026-11-15

## Status

Planned, not started.

## Goal

Notes come in two levels. A plain note is a loose capture in the root of the content directory. Escalating one or more plain notes produces a single worked-out note in its own folder and removes the notes it was written from. Over time the root empties and the folder holds the organized set.

## Decisions

- **Escalated notes are their own entity type, `refined-note`.** Plain notes stay loose files in the root of the content directory; every other entity type gets a folder named after it (`plugins/directory-sync/src/lib/entity-paths.ts`), so refined notes live flat in `refined-note/<id>.md`. The folder shows the level; it has no subfolders.
- **Required structure.** A refined note must have a stated `title` and a one-sentence `summary`. Where at least one grouping applies to `refined-note`, it must also carry at least one grouping membership; a brain with no applicable grouping asks for title and summary only. A refined note that does not meet this is refused at save, whoever writes it (escalation, Studio, tools, directory-sync import). Refined notes saved before a grouping applied keep no membership until their next save.
- **Groupings carry the subject, not the file system.** `refined-note` is a `content` type with a frontmatter adapter, so it takes part in every grouping defined in Studio's `grouping-definitions` document by default. Studio's group views list refined notes beside the posts, decks and other entities with the same value. No grouping decides where a file is placed.
- **The brain writes the refined note.** Escalation generates the title, summary and body from the root notes' content through an escalation template. The result stands on its own and does not mention its sources.
- **Roots are removed right away, with no link back.** The refined note stores no reference to the notes it came from. The removed files remain only in the content repository's git history.
- **Two levels.** Only `note` entities can be escalated. A refined note cannot be escalated or used as a root.
- **Visibility.** A refined note takes the most restrictive visibility among its roots.

## Flow

`refined-note` generation takes `noteIds` (one or more) and optional grouping memberships.

1. Every id must name an existing `note` the caller may read and delete. Otherwise the request is rejected and nothing changes.
2. The brain generates title, summary and body from the roots. Where a grouping applies and the caller gave no memberships, it also chooses them: any existing value for an open grouping, one of the allowed values for a closed grouping. A failed generation, or one without a membership where one is required, writes nothing and leaves the roots.
3. The refined note is saved under a free title, like note generation today.
4. Each root is deleted. A failed delete leaves the refined note in place; the job result lists the roots that remain.

## Phases

1. **Walking skeleton.** The `refined-note` entity (schema, markdown adapter, required title and summary), the escalation template, and generation from a single root with the root deleted. Tests for the schema, the reject and failure branches and the delete; an eval for the template.
2. **Several roots into one.** `noteIds` with more than one id, visibility from the most restrictive root, partial-delete reporting.
3. **Required grouping membership.** The persist validator that applies only where a grouping applies, and membership chosen by the brain for open and closed groupings.
4. **Escalate from Studio.** Select one or more notes in the library and escalate them.

## Validation

Each phase lands with its tests. Before phase 4 ships: in the `personal` test app, escalate one note and then several, check the files under `refined-note/` and the emptied root in the content directory, and check the refined notes in a Studio group view beside another entity type with the same value.
