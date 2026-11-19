# @brains/refined-note

## 0.2.0-alpha.747

### Patch Changes

- Updated dependencies [[`2aaa9d1`](https://github.com/rizom-ai/brains/commit/2aaa9d14fb6facf57d4767663729d8e983428f9a)]:
  - @brains/utils@0.2.0-alpha.747
  - @brains/sdk@0.2.0-alpha.747

## 0.2.0-alpha.746

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.746
  - @brains/utils@0.2.0-alpha.746

## 0.2.0-alpha.745

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.745
  - @brains/utils@0.2.0-alpha.745

## 0.2.0-alpha.744

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.744
  - @brains/utils@0.2.0-alpha.744

## 0.2.0-alpha.743

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.743
  - @brains/utils@0.2.0-alpha.743

## 0.2.0-alpha.742

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.742
  - @brains/utils@0.2.0-alpha.742

## 0.2.0-alpha.741

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.741
  - @brains/utils@0.2.0-alpha.741

## 0.2.0-alpha.740

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.740
  - @brains/utils@0.2.0-alpha.740

## 0.2.0-alpha.739

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.739
  - @brains/utils@0.2.0-alpha.739

## 0.2.0-alpha.738

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.738
  - @brains/utils@0.2.0-alpha.738

## 0.2.0-alpha.737

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.737
  - @brains/utils@0.2.0-alpha.737

## 0.2.0-alpha.736

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.736
  - @brains/utils@0.2.0-alpha.736

## 0.2.0-alpha.735

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.735
  - @brains/utils@0.2.0-alpha.735

## 0.2.0-alpha.734

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.734
  - @brains/utils@0.2.0-alpha.734

## 0.2.0-alpha.733

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.733
  - @brains/utils@0.2.0-alpha.733

## 0.2.0-alpha.732

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.732
  - @brains/utils@0.2.0-alpha.732

## 0.2.0-alpha.731

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.731
  - @brains/utils@0.2.0-alpha.731

## 0.2.0-alpha.730

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.730
  - @brains/utils@0.2.0-alpha.730

## 0.2.0-alpha.729

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.729
  - @brains/utils@0.2.0-alpha.729

## 0.2.0-alpha.728

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.728
  - @brains/utils@0.2.0-alpha.728

## 0.2.0-alpha.727

### Patch Changes

- [#966](https://github.com/rizom-ai/brains/pull/966) [`a57b365`](https://github.com/rizom-ai/brains/commit/a57b365b06adc462b6c4323d17e7046119f0a90b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Notes come in two levels. A `refined-note` is one worked-out note written from one or more plain notes, which it replaces: `system_generate` with `prompt-from-source`, `entityType: "refined-note"` and the note as source writes a title, a one-sentence summary and a body from the note's text, saves it under `refined-note/`, no more visibly than the note, and then deletes the note. The confirmation names the note and says it will be removed; a caller who may not delete notes gets the delete permission error, and a failed generation keeps the note. A refined note must state its `title` and `summary`. It is in the `core` bundle; on a team brain creating and updating one needs Trusted, deleting one Admin, as for a note.

  `prompt` is optional on `prompt-from-source` for every type: without it the entity is written from the source alone, and its id is taken from the source's id. A type that uses its sources up is named after its first source with a prompt too, since there the prompt directs the writing and names nothing. The operation also takes `additionalSourceIds`, further sources of the same type, so one entity can be written from several: one refined note from three notes, with one confirmation that names all three.

  A type declares the source types its generation uses up with `config.consumesSources`. The runtime deletes those sources after the generated entity is saved, as the requester and under their delete policy, and `system_generate` refuses a source of any other type for it. A source that could not be deleted fails the job, which keeps what it wrote and names the source.

  A type declares that its records must belong somewhere with `config.requiresGroupingMembership`. Where at least one grouping applies to the type, every create and update is refused unless the file states a value in one of them; a brain with no grouping for the type asks nothing more, and a generation's placeholder is exempt. A generation of such a type that states no membership is placed by the runtime: the brain chooses one grouping and one value, from the values a closed grouping allows or the values an open one holds. A refined note declares it. A grouping in the registry now carries `multiple` and `values`, which Studio publishes from its definitions.

  Studio's library refines by hand. In a collection whose entries can be refined, each row's number is the mark it is picked with; while entries are picked the page's action is Refine instead of New, and one confirmation lists the picked entries, takes an optional direction and says they will be removed. Studio then moves to where the refined entry is written and says so until it is, and a refusal is shown in the brain's words with nothing changed. `POST /studio/api/refine` carries it, and the type list states `refinesInto` for a collection the signed-in person may refine. The system answers `generate:from-sources` on the bus with the same confirmation and refusals as `system_generate`; an approval runs only the request it was given for, so a direction stated after the confirmation opened is asked for again before it runs.

  An entity named by the name it was saved under is found when that name survives only as its id: `system_get`, `system_update`, `system_delete` and a generation's source resolve "Dashboard drop-off" to the plain note `dashboard-drop-off`, whose file states no title. An entry titled exactly so still wins.

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.727
  - @brains/utils@0.2.0-alpha.727
