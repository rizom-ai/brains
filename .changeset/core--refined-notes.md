---
"@rizom/brain": patch
"@brains/refined-note": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/entity-service": patch
---

Notes come in two levels. A `refined-note` is one worked-out note written from one or more plain notes, which it replaces: `system_generate` with `prompt-from-source`, `entityType: "refined-note"` and the note as source writes a title, a one-sentence summary and a body from the note's text, saves it under `refined-note/`, no more visibly than the note, and then deletes the note. The confirmation names the note and says it will be removed; a caller who may not delete notes gets the delete permission error, and a failed generation keeps the note. A refined note must state its `title` and `summary`. It is in the `core` bundle; on a team brain creating and updating one needs Trusted, deleting one Admin, as for a note.

`prompt` is optional on `prompt-from-source` for every type: without it the entity is written from the source alone, and its id is taken from the source's title. The operation also takes `additionalSourceIds`, further sources of the same type, so one entity can be written from several: one refined note from three notes, with one confirmation that names all three.

A type declares the source types its generation uses up with `config.consumesSources`. The runtime deletes those sources after the generated entity is saved, as the requester and under their delete policy, and `system_generate` refuses a source of any other type for it. A source that could not be deleted fails the job, which keeps what it wrote and names the source.
