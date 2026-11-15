# @brains/refined-note

Worked-out notes written from plain notes, which they replace.

Notes come in two levels. A plain `note` is a loose capture in the root of the content directory. A `refined-note` is one worked-out note written from one or more plain notes. Once it is saved, the notes it was written from are removed, so the root empties over time and `refined-note/` holds the organized set.

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `refined-note`, in the `core` bundle beside the notes:

```typescript
import refinedNotePackage from "@brains/refined-note";
```

## Refining

There is no tool of its own. Refining is `system_generate` with the `prompt-from-source` operation, `refined-note` as the target type and a note as the source. Several notes become one refined note when the others are named in `additionalSourceIds`:

```json
{
  "operation": {
    "kind": "prompt-from-source",
    "entityType": "refined-note",
    "source": { "entityType": "note", "entityId": "pilot-debrief" },
    "additionalSourceIds": ["pricing-call", "setup-complaints"]
  }
}
```

`prompt` is optional and gives the writing a direction. The flow:

1. A caller who may not delete notes gets the delete permission error. A source of another type, or no source at all, is refused.
2. A note the caller cannot see is not found, and nothing changes.
3. The tool asks one confirmation that names every note and says they will be removed. Nothing is written or removed before the caller confirms.
4. `refined-note:generation` writes a title, a one-sentence summary and a body from the notes' text through the `refined-note:refinement` template. A failed generation writes nothing and keeps the notes.
5. Where a grouping applies to refined notes, the brain places what it wrote: it chooses one grouping and one value, from the values a closed grouping allows or the values an open one already holds, and follows the direction when it says where the note belongs. A choice the groupings refuse fails the generation, which writes nothing and keeps the notes.
6. The refined note is saved, no more visibly than the notes it was written from.
7. The notes are deleted. One that could not be deleted is an error: the refined note stays and the job result names the note that remains.

The type declares `consumesSources: ["note"]` and `requiresGroupingMembership: true`; the brain's runtime and `system_generate` do the removal, the confirmation and the placing for any type that declares them.

## Schema

A refined note is stored in `refined-note/<id>.md`. Its frontmatter is its metadata:

```yaml
---
title: Push beats pull
summary: People use the brain when it comes to them, not when they have to go to it.
---
The worked-out note in markdown...
```

- `title` and `summary` are required. A file without either is refused, whoever writes it.
- Where at least one grouping applies to refined notes (Studio → System → Structure → Groupings), the file must also state a value in one of them, such as `projects: [Lighthouse]`. A brain with no grouping for refined notes asks for title and summary only, and a refined note saved before a grouping applied keeps no membership until its next save.
- `status` (`generating` or `failed`) and `error` are set by the generation. Only a placeholder with a status goes without a summary and a membership.
- It keeps no reference to the notes it was written from, and it cannot be refined again.

## Evals

```bash
bun run eval
```

The `refineNotes` handler runs the refinement template on the loose notes' text, with an optional direction.
