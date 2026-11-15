# @brains/refined-note

Worked-out notes written from plain notes, which they replace.

Notes come in two levels. A plain `note` is a loose capture in the root of the content directory. A `refined-note` is one worked-out note written from one or more plain notes. Once it is saved, the notes it was written from are removed, so the root empties over time and `refined-note/` holds the organized set.

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `refined-note`, in the `core` bundle beside the notes:

```typescript
import refinedNotePackage from "@brains/refined-note";
```

## Refining

There is no tool of its own. Refining is `system_generate` with the `prompt-from-source` operation, `refined-note` as the target type and a note as the source:

```json
{
  "operation": {
    "kind": "prompt-from-source",
    "entityType": "refined-note",
    "source": { "entityType": "note", "entityId": "pilot-debrief" }
  }
}
```

`prompt` is optional and gives the writing a direction. The flow:

1. A caller who may not delete notes gets the delete permission error. A source of another type, or no source at all, is refused.
2. A note the caller cannot see is not found.
3. The tool asks one confirmation that names the note and says it will be removed. Nothing is written or removed before the caller confirms.
4. `refined-note:generation` writes a title, a one-sentence summary and a body from the note's text through the `refined-note:refinement` template. A failed generation writes nothing and keeps the note.
5. The refined note is saved, no more visibly than the notes it was written from.
6. The notes are deleted. One that could not be deleted is an error: the refined note stays and the job result names the note that remains.

The type declares `consumesSources: ["note"]`; the brain's runtime and `system_generate` do the removal and the confirmation for any type that declares it.

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
- `status` (`generating` or `failed`) and `error` are set by the generation. Only a placeholder with a status goes without a summary.
- It keeps no reference to the notes it was written from, and it cannot be refined again.

## Evals

```bash
bun run eval
```

The `refineNotes` handler runs the refinement template on the loose notes' text, with an optional direction.
