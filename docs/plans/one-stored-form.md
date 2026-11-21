# Plan: Stored format for `0.2.0`

Last updated: 2026-11-21

## Status

Proposed stable-release gate. Nothing is built. The file format a brain stores is part of what `0.2.0` makes public: content repositories, Obsidian vaults and outside entity packages all depend on it. It is settled and every type conforms before the stable release, and brains running an alpha today are carried over without a manual step. The findings come from a walk of the header schema of every registered type, from real files of each type (six content repositories, the recipe seeds and the eval content), and from round-tripping those files through each type's serializer, on `516c6dd214`. Types missing from those sources were read elsewhere: `book-section` in a pilot brain's book content, `grouping-definitions` in a pilot user's content, `playbook` in the onboarding content this repository ships, `traffic-snapshot` and `refined-note` on a live brain. Five types have no stored instance anywhere that could be read (`conflict`, `contact-request`, `form`, `mail-item`, `quiz-result`); they are written only by their own code, and are described from their schema and the stored documents in their tests.

## Problem

Entity files are inconsistent in two ways.

**Placement.** Types disagree on where content lives and on whether the header nests. `site-info` keeps everything it holds in frontmatter, three levels deep, and has no body. `site-content` keeps the same kind of data (a call to action, section copy) entirely in a body of headings and has no frontmatter. Fifteen types nest objects in the header, in five different ways for the same concepts; twenty-two are flat.

**Form.** The markdown stored for one record depends on the path that wrote it. A file import, a tool update, a default creation and a visibility change each produce different bytes, and the types disagree on key order.

## Rule

### Placement

- **The header holds only what Obsidian shows as a property:** text, number, checkbox, date, date and time, and lists of text. No objects, no lists of objects, no keyed records, in any type. Every type's files reach the vault, so no type is exempt.
- **The header holds what the brain lists, filters, sorts or routes by:** titles, slugs, statuses, dates, flags, references to other entities.
- **Prose goes in the body.** Anything sentence-length is markdown, never a YAML scalar. Structured copy is written through `StructuredContentFormatter` (`@brains/content-formatters`) in the layout under [Body](#body).
- **A short group of settings is flat keys with a shared prefix** (`ctaHeading`, `ctaButtonText`, `ctaButtonLink`).
- **Data without prose is a YAML file.** A definition or a measured record that cannot be flat and has no body to read is stored as `<id>.yaml`, validated whole by the type's schema. Obsidian's properties never see it. The test for the format is strict: the record is structure that cannot be flat, and nobody reads the file as a document. Prose such a record carries is a YAML block scalar.
- **One shape per concept.** A source reference, a person, a time range and a list of references are written the same way in every type.
- A value is stored once. A body rendered from a header field, or a header field restating the body, is not stored twice.

### Body

```markdown
## Translations

### nl

- **Title:** Yeehaa
- **Description:** Essays, lezingen en projecten.

## Inputs

### Discord

- **Label:** Source · chat

Shared decisions and field notes captured in flow.
```

- **No fixed title line.** A body does not open with a constant heading such as `# FAQ`.
- **A single-line value is a labeled line,** `- **Label:** value`, under the section it belongs to.
- **Prose is text under its heading.** A section's one prose field is the section's plain text; a second prose field gets its own heading.
- **A list item is headed by its own title,** not by a number. An item with no title keeps a numbered heading.
- **A keyed record is one heading per key,** the key as the heading text.
- **Nothing is skipped.** A heading or a label the type does not name, and a named section stated twice, refuse the write.

### Form

- **Framing.** Header, then the body with no blank line above it and one newline at its end. A document without a body is its header followed by one empty line, as today.
- **Key order.** A write keeps the key order of the document it replaces. A key that document lacks follows the rest, in the order the type declares.
- **Defaults.** A value the schema supplies is not written. A file states only what its author stated.
- **Unknown keys.** A key the type does not name is kept as written, and the write says so. A type whose header is strict (contact requests, quiz results, mail items, forms) refuses the file instead and leaves its stored row as it was: the key is never dropped silently.
- **Idempotence.** Writing back what a read returned changes no byte.
- **Whole documents or bodies.** A writer hands over the stored document, or the body alone for a type read as its body, never a header of only the keys it changes: a partial header would move the keys it leaves out behind the ones it states.

### Contract

- **Two formats.** A stored entity is a markdown document or a YAML data file. There is no third.
- **The file shape is private to the type's codec.** Every reader takes a record's fields from its metadata through `recordFields` (`@brains/contracts`), and its body through `recordBody`; only a record with no metadata at all is read from its header. A type's own package may read its documents as stored through `storedDocumentParts`, as the book package reads its books and the topics it shows.
- **Enforced at registration.** A markdown type whose header schema holds an object, a list of objects or a record is refused when it registers, first-party or not. `0.2.0` ships with the check on, so no outside type can start out nested.
- **Changing a field after `0.2.0`.** A key moves, is renamed or changes shape only through a translation in its type's codec: the old form is read, the new one written, stored rows rewritten quietly on start. An old key stays readable through the next minor release.
- **Frozen by golden files.** One golden file per type, in old and new form, fixes the format; a change to a golden file is a format change and needs a translation.

## Findings: placement and nesting

All 39 types the canonical brain registers, plus the two the shell registers (`anchor-profile`, `brain-character`), from a walk of each type's header schema and from real files where a content repository has them. `document` and `image` are binary and have no header. `email-reply-draft` has a flat header (`revision`, `status`, `sentAt`, `mailItemId`) and a body. `person` in `unified-inbox` and the second `site-info` in `site-builder` are empty reading handles, not stored shapes.

### Nesting in the header

Fifteen types nest; twenty-two are flat.

| Type                   | Nested header fields (depth)                                                                     | Kind                    |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `site-info`            | `cta` (1), `sections` (2, keyed record), `translations` (3, keyed record holding a nested `cta`) | authored copy           |
| `style-guide`          | `messaging` (1), `voice` (1), `visual` (1)                                                       | authored copy           |
| `swot`                 | `strengths`, `weaknesses`, `opportunities`, `threats` (1, lists of title and detail)             | authored copy           |
| `guide`                | `material` (1, list of objects)                                                                  | authored copy           |
| `anchor-profile`       | `socialLinks` (1, list of objects)                                                               | authored copy           |
| `form`                 | `steps` (4), `scoring` (3), `thanks` (1), `notify` (1), `limits` (1)                             | definition and settings |
| `grouping-definitions` | `groupings` (2, keyed record)                                                                    | definition              |
| `quiz-result`          | `results` (1), `answers` (1)                                                                     | submitted record        |
| `traffic-snapshot`     | `days` (2, with four nested lists per day)                                                       | measured record         |
| `decision`             | `timeRange` (1), `decidedBy` (2), `mentionedBy` (2)                                              | provenance              |
| `summary`              | `timeRange` (1), `participants` (2)                                                              | provenance              |
| `action-item`          | `sourceRef` (1), `assignedTo` (1), `requestedBy` (1)                                             | provenance              |
| `link`                 | `source` (1)                                                                                     | provenance              |
| `mail-item`            | `source` (1)                                                                                     | provenance              |
| `social-post`          | `documents` (1, list of `{ id }`)                                                                | reference               |

Flat (scalars and lists of plain strings only): `agent`, `ask-content`, `book`, `book-section`, `brain-character`, `conflict`, `contact-request`, `deck`, `doc`, `email-reply-draft`, `faq`, `newsletter`, `note`, `playbook`, `post`, `project`, `prompt`, `refined-note`, `series`, `skill`, `topic`, `wish`. `site-content` has no header fields of its own.

`site-info` is the deepest authored header in the brain. Only `form` goes deeper.

The same thing nested in different ways:

- **A source reference** is an object in `link` (`source.ref`, `source.label`) and `mail-item` (`source.ref`, `source.threadKey`), a differently shaped object in `action-item` (`sourceRef.sourceId`, `.entityType`, `.entityId`), and flat keys in `social-post` (`sourceEntityId`, `sourceEntityType`) and `newsletter` (`sourceEntityType`, `entityIds`).
- **A person** is `{ name, id, aliases }` in `action-item` and `{ identity, identityAliases, displayName }` in `decision` and `summary`.
- **A list of references** is a list of objects in `social-post` (`documents: [{ id }]`) and a list of strings in `newsletter` (`entityIds`).
- **A call to action** is a nested header object in `site-info` and `## Primary CTA` / `### Label` / `### Href` body headings in `site-content`.

### Where authored content sits

| Type                              | Body in real files                    | Authored content in the header                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `site-info`                       | none (0 of 12); `hasBody: false`      | all of it                                                                                                                                                                                                                                              |
| `brain-character`                 | none (0 of 13); `hasBody: false`      | all of it: `role`, `purpose`, `values`                                                                                                                                                                                                                 |
| `skill`                           | none (0 of 50)                        | all of it: `description`, `tags`, `examples`                                                                                                                                                                                                           |
| `swot`                            | none (0 of 4)                         | all of it                                                                                                                                                                                                                                              |
| `style-guide`                     | none (0 of 7), though `hasBody: true` | all of it                                                                                                                                                                                                                                              |
| `grouping-definitions`            | `hasBody: false`                      | all of it                                                                                                                                                                                                                                              |
| `anchor-profile`                  | 3 of 13                               | `description`, `socialLinks`, and the profile extensions (`tagline`, `intro`, `expertise`, `currentFocus`, `availability`; for teams `purpose`, `focusAreas`, `capabilities`, `workingPrinciples`; for organizations `mission`, `offerings`, `values`) |
| `guide`                           | all                                   | `for`, `material`, `persona`, `summary`                                                                                                                                                                                                                |
| `ask-content`                     | 1 of 1                                | page copy: `topicsHeading`, `contactLabel`, `contactNote`, `mapCaption`, `refusal`, `faqHeading`                                                                                                                                                       |
| `form`                            | `hasBody: true`                       | the whole form definition                                                                                                                                                                                                                              |
| `quiz-result`, `traffic-snapshot` | no sample                             | the record itself                                                                                                                                                                                                                                      |

Types whose authored content is in the body, as headings: `site-content` (31 of 56 files have no header at all), `agent` (`# Agent` / `## About` / `## Skills` / `## Notes`), `faq` (`# FAQ` / `## Answer`), `series` (`## Description`), `project` (`## Context` / `## Problem` / `## Solution` / `## Outcome`), `summary`, `decision`, `action-item`, `doc`, `deck`, `book`.

Types whose body is free text under a small flat header: `note`, `refined-note`, `post`, `newsletter`, `social-post`, `prompt`, `wish`, `topic`, `link`, `contact-request`, `email-reply-draft`, `conflict`, `book-section`, `mail-item`.

`playbook` needs no move: its header fields (`description`, `starterText`, `starterPrompt`) are one line each in the shipped files, and its body is already headings (`## Purpose`, `## Operating Rules`).

The same data placed two ways:

- An agent's skills are a `## Skills` list in the `agent` body; a `skill` record is header only.
- A description is a body section in `series` and `agent`, and a header key in `anchor-profile`, `skill`, `site-info`, `post`, `deck`, `project` and `link`.
- The brain's own character (`brain-character`) is header only; a peer brain's (`agent`) is body sections.

### What each field becomes

Nested fields:

| Field                                                                                                      | Becomes                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-info` `cta`                                                                                          | header keys `ctaHeading`, `ctaButtonText`, `ctaButtonLink`                                                                                                                                                  |
| `site-info` `sections`                                                                                     | body: `## Sections`, one `###` per section id holding its blurb                                                                                                                                             |
| `site-info` `translations`                                                                                 | body: `## Translations`, one `###` per language, its title, description, copyright and call to action as labeled lines                                                                                      |
| `style-guide` `messaging`, `voice`, `visual`                                                               | body sections above the guidance                                                                                                                                                                            |
| `swot` four lists                                                                                          | body: one `##` per quadrant, one `###` per item                                                                                                                                                             |
| `guide` `material`                                                                                         | body: `## Material`, one `###` per source                                                                                                                                                                   |
| `anchor-profile` `socialLinks`                                                                             | body: `## Links`, a markdown link list                                                                                                                                                                      |
| `form` (whole definition)                                                                                  | a YAML file; the introduction a form keeps in its markdown body today becomes its `intro` key                                                                                                               |
| `grouping-definitions` `groupings`                                                                         | a YAML file                                                                                                                                                                                                 |
| `quiz-result` `results`, `answers`                                                                         | body: `## Results` and `## Answers`                                                                                                                                                                         |
| `traffic-snapshot` `days`                                                                                  | a YAML file; the rendered body tables are no longer stored                                                                                                                                                  |
| `link`, `mail-item` `source`; `action-item` `sourceRef`                                                    | header `sourceRef` (text) and, where the type has them, `sourceLabel`, `threadKey`, `threadOrdinal`, `personId`; for `action-item` also `sourceEntityType` and `sourceEntityId`                             |
| `decision`, `summary` `timeRange`                                                                          | header `startedAt`, `endedAt` (date and time)                                                                                                                                                               |
| `social-post` `documents`                                                                                  | header `documentIds`, a list of text                                                                                                                                                                        |
| `decision` `decidedBy`, `mentionedBy`; `summary` `participants`; `action-item` `assignedTo`, `requestedBy` | the same key as a list of actor references as text (`user:<id>`, `agent:<id>`, `external:<id>`, `service:<id>`), and a second key with the `Aliases` suffix (`decidedByAliases`); display names in the body |

`sections` and `translations` are records keyed by a name the author chooses. `StructuredContentFormatter` maps fixed objects and lists only, so it gains a record mapping: one heading per key, the key as the heading text. That is part of phase 1.

The retriever reads people as the union of identities and aliases (`conversation-memory-retriever.ts`), so two flat lists carry what it needs.

Flat fields that hold prose and move to the body:

| Type              | Fields                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-info`       | none; `title`, `description` and `copyright` are one line each and stay                                                                                                                |
| `brain-character` | `purpose`, `values`; `name` and `role` stay                                                                                                                                            |
| `skill`           | `description`, `examples`; `name` and `tags` stay                                                                                                                                      |
| `anchor-profile`  | `description`, `intro`, `currentFocus`, `availability`, and the team and organization `purpose`, `mission`, `workingPrinciples`; the existing free body becomes the `## Story` section |
| `guide`           | `for`                                                                                                                                                                                  |
| `ask-content`     | `contactNote`, `refusal`                                                                                                                                                               |

## Findings: form

### How a write is framed

```
file import        -> adapter.toMarkdown(whole document)
                      -> bodyAsRead: readMarkdownFrontmatter (body not trimmed)
                      -> generateMarkdown(header, "\n# Body\n\n")      -> "---\n\n# Body\n\n"
tool update        -> read: parseMarkdownWithFrontmatter (body trimmed)
                      -> generateMarkdown(header, "# Body")            -> "---\n# Body\n"
non-public entity  -> applyVisibilityToMarkdown trims the body         -> "---\n# Body\n"
codec that trims   -> encode: content.trim()                           -> "---\n# Body\n"
```

`generateMarkdown` (`shared/utils/src/markdown-frontmatter.ts`) writes the body it is handed. Whether that body is trimmed is decided upstream, differently per path. Failure branch: a type whose codec passes the body through stores the imported framing, and the next update or visibility change rewrites the file.

### Per type

Import and update disagree (one input: a blank line under the header, two newlines at the end):

| Type                                       | On import                              | On update                                |
| ------------------------------------------ | -------------------------------------- | ---------------------------------------- |
| `doc`, `prompt`, `wish`                    | blank line kept, two trailing newlines | blank line dropped, one trailing newline |
| `book`, `decision`, `guide`, `faq`         | two trailing newlines                  | one trailing newline                     |
| `summary`, `faq`                           | body rewritten from its structure      | body differs again from the import       |
| `note` (files with keys it does not write) | keys in declared order                 | keys in document order                   |

Key order, by type:

- Document order (`writesInDocumentOrder`): `agent`, `book`, `book-section`, `contact-request`, `decision`, `faq`, `form`, `grouping-definitions`, `link`, `mail-item`, `playbook`, `quiz-result`, `swot`, `topic`, `traffic-snapshot`, and the identity singleton `anchor-profile`.
- Declared order, so an imported file is reordered: `site-info`, `style-guide`, `post`, `deck`, `project`, `newsletter`, `social-post`, `series`, `skill`, `doc`, `guide`, `prompt`, `wish`, `summary`, `action-item`, and the identity singleton `brain-character`.

The same flag also decides whether `created` and `updated` stated in a file stay there: `link` keeps them, `post`, `deck` and `project` drop them.

### site-info

- **Default written.** `represents` defaults to `anchor` in `siteMetadataSchema`, so every write adds `represents: anchor` to a file that never stated it. The default record is created from metadata alone and holds only that line.
- **Reordered.** `cta` and `sections` swap to declared order on the first write.
- **Nested key deleted.** `cta.subtitle` (in a real content repository) is not in the schema. Zod drops it on decode, and because the stored form lacks a nested key the file had, the import writes the file back without it. A top-level unknown key is preserved by `preserveSourceFrontmatter`; one level down it is deleted from the author's file.
- **File and row differ.** An import whose stored form only adds or reorders is not written back (`dropsFrontmatterFields` is false), so the row holds `represents` and declared order while the file holds neither, until some later write exports it.
- **Rows from before the declared type.** A row last written by the class adapter keeps that adapter's form: file order, no `represents`, and older YAML quoting. Nothing rewrites it.
- **Two definitions.** `plugins/site-builder/src/lib/site-workspace.ts` declares a second `site-info` with empty metadata to read the record.

## Mechanism

### Moving a field

```
old file (field nested in the header)
  -> decode: new location absent -> read the old header key (listed in translatedFields)
  -> metadata and typed fields as before, so readers do not change
  -> encode: flat header keys; body sections for the rest
  -> the quiet rewrite on start stores the new form; directory sync exports it
new file
  -> decode: flat keys and body sections are read back into the same metadata
```

Failure branches: a file that states a field in both places reads the new location and drops the old key on the next write. A body section that does not parse refuses the write with the type's validation error and leaves the stored row as it was; an import sets the file aside as it does for any invalid file.

Each moved type gets a markdown codec. A key that goes away (`cta`, `source`, `timeRange`) is listed in `EntityTypeConfig.translatedFields`, the mechanism [frontmatter-hygiene.md](./frontmatter-hygiene.md) built: it is read and never written. A key that keeps its name and changes shape (`action-item` `sourceRef` from an object to text, the people lists from objects to text) cannot be listed there, because a translated key is never written. Its codec decodes either shape and encodes the new one, and the quiet rewrite finds the row because its stored document differs from its canonical form. In-memory metadata keeps its current shape (`metadata.cta.heading` stays), so data sources, templates and tools are untouched; only the codec knows the file shape. A type whose body is an encoding of its fields, as `site-info`'s is, keeps `hasBody: false`: a read hands back its fields and no body, so a field update and a body edit cannot overwrite each other, and the body is edited in the file or in Studio's raw mode. A type whose body is prose it authors moves fields into a body it already has.

A type that reads two forms states every key either form writes with `withWrittenFrontmatterSchema`, so writing one form after reading the other leaves none of the other's keys behind as unknown.

`anchor-profile` and `brain-character` are not declared types. The shell registers them with class adapters whose truth is the content's frontmatter (`shell/identity-service/src/singleton-frontmatter-adapter.ts`), and the profile plugin extends the anchor's header with its own fields. Their adapters gain the same decode and encode through the formatter, the profile extensions state which of their fields are body sections, and the identity service keeps reading through the adapter, so `getProfile()` and `get()` return what they return now.

### Obsidian

The fileClass generator in `plugins/obsidian-vault` reads the type's frontmatter schema, which today yields a text `Input` for `cta` and `sections`. Each moved type states its flat file header through `withFrontmatterSchema`, so fileClasses, templates and Studio's form show exactly the keys the file has.

### The formatter

`StructuredContentFormatter` today, and what changes:

| Today                                                                                                                      | End state                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A heading no mapping names is ignored, and the next write deletes its content; of two sections with one name the last wins | both refuse the write                                                                          |
| A list of objects is written as `### Input 1`, the item's title one level down                                             | the item's title is the heading                                                                |
| The item heading is the label minus its last letter (`Opportunities` gives `Opportunitie 1`)                               | no derived singular; a numbered heading uses a stated item label                               |
| Fixed objects and lists only                                                                                               | a record mapping for keyed records                                                             |
| Every scalar is its own heading                                                                                            | single-line values are labeled lines                                                           |
| A constant `# Title` line opens every body                                                                                 | none                                                                                           |
| A list item that is not a string or number is written as JSON text                                                         | refused                                                                                        |
| Each type hand-writes keys, labels and types beside its Zod schema                                                         | the mapping is derived from the schema; labels and the single-line marking are schema metadata |

```
read   -> a value under its own heading or as a labeled line; a numbered or a titled item;
          with or without the title line  -> the same typed body
write  -> the new layout, for a type or section template that has opted in; the old one otherwise
```

Failure branches. A prose field whose own text would parse as a labeled line of its section is written under its own heading, so the output never reads back differently. A numbered item is told from a titled one by a title field inside it. Two items of one list may share a title; the duplicate check applies to named sections only.

Two files handle a body's headings themselves instead of going through the formatter: `entities/faq/src/lib/stored-body.ts` and `entities/series/src/lib/series-projection.ts`. Both move onto the formatter in phase 4. Body templates shown to an author or a model come from the formatter's own `generateBodyTemplate`, so they follow the layout without a separate change.

The compact layout and its strict checks come with a type opting in (`layout: "compact"`): a type that has not opted in reads and writes the sectioned layout exactly as before, so no file a brain holds today is refused by a check it did not have. The formatter reads both layouts from alpha R on. The seven places that construct one opt in to the new layout at alpha W, except the section templates, which follow under [Sites](#sites).

### YAML files

`EntityTypeConfig` gains a storage format, `markdown` (the default) or `yaml`. A YAML type's stored content is the YAML document itself:

```
write  -> schema.parse(fields) -> yaml.dump in document order -> <type>/<id>.yaml
read   -> yaml.load -> schema.parse -> metadata as the type derives it today
import -> a .yaml file under a YAML type's folder; a .md file there, in the old form,
          is read through the old codec and replaced by the .yaml file on the rewrite at start
```

Failure branches: a file that does not parse or fails the schema is refused with the type's validation error and set aside on import, as an invalid markdown file is. A `.yaml` file under a markdown type's folder is not an entity and is left alone.

- Visibility is a top-level `visibility` key, written only when not public, as in a markdown header.
- The form rules hold: document key order kept, no default written, unknown keys kept and reported.
- A YAML type has no body. `grouping-definitions` and `traffic-snapshot` are found by their metadata only; a form's `intro` and title are what is embedded for it.
- A form has a markdown body today: the introduction shown above its fields (`entities/form/test/form-entity.test.ts`). In the YAML file it is the `intro` key, a block scalar, beside the thanks text. The no-prose-in-YAML rule is for markdown headers, where a scalar is one line in Obsidian; a block scalar in a data file keeps its line breaks and is edited as text.
- A `.md` file name is assumed in 28 places in 13 files: eight in directory sync (nine of them in `file-operations.ts`, three in `file-discovery.ts`), four in WebDAV (`dav-tree.ts`, `dav-saves.ts`, `dav-routes.ts`, `dav-scratch.ts`) and the Obsidian plugin. The entity service, the core and Studio assume none. Each of the 13 asks the type for its file extension. The binary types (`image`, `document`) already store under other extensions, but through the asset path, which a YAML type does not use.
- Obsidian hides non-markdown files by default, so these three types are edited in Studio or a text editor.

CSV is not added. None of the three is one table: a form and the groupings are trees, and a snapshot's day carries four nested lists. CSV also has no types and nowhere to state visibility.

### Framing in the serializer

`EntitySerializer.serializeEntity` frames every text document after the adapter and the preserved-frontmatter step: body trimmed, one trailing newline. Codecs stop trimming for themselves, and `bodyAsRead` no longer decides framing. Asset-backed rows are untouched.

### Document order for every type

`inDocumentOrder` runs for every text type. `writesInDocumentOrder`, its symbol and its fifteen call sites are deleted. Keeping stated `created` and `updated` moves with it: every type keeps a record field its file states, as the fifteen do now.

### Stated fields only

For a type whose metadata is its frontmatter, the serializer writes a key only when the document it replaces states it or the write sets it to something other than the schema default. Metadata keeps the default, so readers see `represents: anchor` whether or not the file says so. The default site-info record is created with an empty header.

### Unknown keys

A key the type does not name is kept as written, and the write reports it: an import logs a warning naming the file and the key, and `system_update` returns it in its result. Until a type's header is flat, `preserveSourceFrontmatter` also keeps an unclaimed key one level inside an object the type owns, so `cta.subtitle` is no longer deleted. When the object is flattened, an unknown key inside it is carried over under the same prefix (`cta.subtitle` becomes `ctaSubtitle`) and reported like any unknown key; an unknown scalar key inside an object that moves to the body is carried into the header the same way, since the body refuses a label it does not name. An unknown nested value that is itself an object has no flat form: that row is left in its old form, still read, and reported, for its author to settle. A retired `parent.key` is still dropped.

### Stored rows

Every serving start, once startup content settles, rows whose stored document differs from its canonical form are rewritten by the quiet rewrite described under [Migration](#migration). While the old form is written (alpha R), only a row whose difference is its framing is rewritten; a row that differs further waits for alpha W and is counted as deferred in the start log, so a type's change of form never reaches stored rows before its release writes it. An unchanged file whose row was stored in an earlier framing is not imported again: directory sync compares it with the row as the row serializes now. Order and stated keys are properties of the document a write replaces, so existing rows already satisfy them and need no rewrite.

### Contract test

`packages/brain-cli/test/stored-form.test.ts` runs every type the canonical brain registers, plus the two the shell registers, through import, read, write-back and a visibility change, and asserts both rules: every markdown header value is an Obsidian property type, a YAML type has no markdown file, and the bytes are the same on every path, in document order, with no default written and unknown keys kept. A type not yet moved is listed in the test as pending, and the list is empty at alpha W. A type added later is covered without a new test.

## Migration

Every brain today runs an alpha and is deployed from this repository's releases. The entity types defined outside the canonical brain (the public-authoring fixtures under `packages/brain-cli/test/fixtures` and the `brain-plugin-recipes` package) have flat headers of scalars and string lists and pass the registration check unchanged. The whole migration happens on alphas before `0.2.0`, and `0.2.0` contains only the final format plus the reading of old forms.

What a brain's owner sees: nothing. No command, no setting, no changed timestamps, no derived work queued, the same site and the same answers. An entity whose embedded text changed is re-embedded once; that includes every `site-content` section, which is embedded like any text type. The content repository gains one commit for the brain's types and, where the brain serves a site, one for that site's sections.

### Two alphas, then the stable release

```
alpha R  every reader uses metadata; every moved type reads old and new form; all write the old form
alpha W  every moved type writes the new form; stored rows are rewritten quietly on start
0.2.0    the format is frozen; old forms are still read
```

R is deployed to every brain before W is released, so a brain rolled back from W lands on a version that reads what W wrote. That ordering is the whole of the rollback design: W is the commit that switches each moved type's encoder to the new form and deletes the old encoder. No setting selects between forms and no runtime guard checks the order; the fleet pins decide which version a brain runs. A brain first started on W or later stores what it imports, old-form files included, in the new form at import.

Old keys stay declared in `translatedFields`, so an old-form file arriving after W (a hand edit from habit, an old branch merged into a content repository, seed content from an older template) still imports and is rewritten.

### The rewrite is quiet

The existing rewrite on start calls `updateEntity`. An ordinary update moves `updated`, marks the entity as a dirty input for projections, queues an embedding job and emits the entity-updated event (`shell/entity-service/src/entity-mutations.ts`). A migration rewrite is a separate write that changes only the stored document:

```
rewrite on start (after the initial import, so a pending file edit lands first)
  -> stored document differs from its canonical form?  no -> skip
  -> write content and contentHash; keep `updated`
  -> update the full-text index row from the new document
  -> text the type embeds unchanged?  yes -> keep the embedding; no -> re-embed
  -> not marked as a dirty projection input and no entity-updated event, so no derived job is queued
  -> mark for export, so directory sync writes the file
```

Failure branches: a row whose document does not decode is left as stored and logged, and the start continues. A file edited since the brain last saw it is imported first; if that import and the rewrite both changed the document, the edit wins and is then stored in the new form.

All of a brain's rewritten files are exported as one commit whose subject names the format migration. A second start rewrites nothing and exports nothing.

### From `.md` to `.yaml`

```
alpha R  reads <id>.md and <id>.yaml, writes <id>.md
alpha W  rewrite on start:
  -> <id>.md unchanged since last seen?  yes -> write <id>.yaml, delete <id>.md, in the migration commit
  -> <id>.md edited?  import it through the old codec first, then replace it
  -> both files present and both changed since the base -> a sync conflict, neither is deleted
```

An `<id>.md` that appears later under a YAML type's folder is imported through the old codec and replaced the same way.

### Readers

Done in phase 3. `frontmatterRecordFields`, which read a record's header whenever its content carried one, is removed. The style guide, ask-content, site info, publishing (covers, attachments, sources), social posts, posts, decks, FAQs and playbooks read through `recordFields`. The site builder's own `site-info` is a never-registered handle for a settings link and permission checks, not a stored shape, and stays; no `arch:check` rule is added, because each moved type's readers are checked against both forms by the contract test in phase 4.

### Studio

Studio builds its form from the type's frontmatter schema and shows a nested object or a list of objects read-only (`plugins/studio/ui-react/src/entity-fields.tsx`). So `cta`, `sections` and `translations` cannot be edited in Studio today. After the move, the flat keys are ordinary editable fields and the body sections are edited in the body editor. Nothing that is editable in Studio today stops being editable, and no Studio work gates the migration.

### Obsidian

Fileclasses and templates are regenerated from the flat header on W. The three YAML types leave Obsidian's default file view.

### Sites

`site-info` needs nothing from a site. Layouts get the site's metadata from the build, and the `personal` and `professional` homepages and the deck carousel read it through `fetchSiteInfo`; metadata keeps its shape, so a site pinned to an older release reads the same values.

`site-content` is different in two ways. Its codec passes the body through; the body is parsed at build time by each section template's formatter (`shared/site-composition/src/section-templates.ts`), so the quiet rewrite, which works through a type's codec, cannot convert it. And sites are pinned separately from the brain (a fleet image names its site pins; an instance repository pins `@rizom/brain` and `@rizom/site` on their own), so a site can run an older formatter than its brain.

```
alpha R + site release R   the formatter reads both layouts; section templates write the old one
every brain moved to alpha R; every pin of @rizom/site-rizom-ai moved to its release R
alpha W                    the brain's own types write the new layout
  -> a site the brain formats: its section templates write the new layout too, and the
     site builder rewrites that site's site-content quietly and exports it in one commit
  -> @rizom/site-rizom-ai: its site-content is left as it is
site release W             @rizom/site-rizom-ai's section templates opt in to the new layout
  -> its site builder rewrites its site-content the same way
```

Failure branch: a site still pinned before site release R, served by a brain whose `site-content` is already in the new layout, cannot parse its sections. Site release W is therefore pinned for a brain only after that brain is on alpha W and its `@rizom/site-rizom-ai` pin is on site release R or later.

Only `@rizom/site-rizom-ai` carries its own formatter: its build bundles everything but React, `clsx` and `tailwind-merge`, and three of its sources import `@brains/content-formatters` and two `@brains/site-composition`. The other published sites (`docs`, `hub`, `thefourth`, `books`) are published as source with no build step and import nothing from `@brains/*`, and a site written against `@rizom/site` has Zod as its only dependency; none of them can carry a formatter, so their sections are formatted by the brain. So site release R and W are releases of `@rizom/site-rizom-ai` alone; for every other site the order is the brain's two alphas, and its sections are rewritten at alpha W.

### What is removed, and when

| Code                                                                                                                                       | Removed                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| The 63 direct header readers, `frontmatterRecordFields`, `writesInDocumentOrder`, each codec's own trim, the second `site-info` definition | during the work, by alpha R                       |
| Encoders for the old header forms and the old body layout                                                                                  | at alpha W (site release W for section templates) |
| Decoders for the old header forms, the old body layout, and `.md` files of the YAML types                                                  | one minor release after `0.2.0`                   |

Reading outlives writing because an old file can still arrive after the migration: a backup restored, an old branch merged into a content repository, a brain that was off during the upgrade. Each old decoder is listed in `docs/legacy-code-inventory.json` with the release that removes it. The quiet rewrite and the read-old, write-new translation are permanent; a format change after `0.2.0` reuses them.

### What the owner of a brain may notice

- A personal clone of the content repository with an unpushed edit to a rewritten file gets an ordinary git merge conflict. The `0.2.0` notes say to push or pull before upgrading.
- Their own Obsidian query or template on a nested property (`cta.heading`) stops matching. The notes list every renamed or moved key.

### What the contract test adds

For every moved type and every section template, from a golden file in the old form and one in the new: both decode to the same metadata; the type's readers return the same values from either; the rewrite leaves `updated` unchanged and queues no job; a second rewrite changes nothing; an edited old-form file is imported, not overwritten.

## Phases

1. **site-info, end to end.** Done (#1014). The contract test for one type, failing on nesting and on form; then the formatter's strict headings, record mapping and labeled lines, the flat `cta` keys, `sections` and `translations` in the body, its readers on metadata, the serializer changes (framing, document order, stated fields only, unknown keys) and the quiet rewrite. Verified in the `rizom-ai` test app in two builds: with the old encoder the old `site-info.md` reads and is left alone; with the new one it is rewritten once, `updated` unchanged, the site builds the same, Studio edits the `cta` keys as fields and the sections in the body, the Obsidian fileClass lists only flat keys, and a `system_update` changes only the field updated.
2. **Form for every type.** Done (#1015): `packages/brain-cli/test/stored-form-every-type.test.ts` holds all 37 text types to a golden file each; `writesInDocumentOrder` is deleted and codecs no longer trim their own body.
3. **Readers on metadata.** Done (#1016): `recordFields`, `recordBody` and `storedDocumentParts` replace `frontmatterRecordFields`.
4. **Every moved type reads both forms.** The rest of the formatter (titled items, schema-derived mappings, no title line), reading both layouts, with `faq` and `series` moved onto it; codecs, `translatedFields` and golden files for the authored-copy types (`style-guide`, `swot`, `guide`, `anchor-profile` with the profile extensions, `brain-character`, `skill`, `ask-content`, `quiz-result`) and the shared shapes (`link`, `mail-item`, `action-item`, `decision`, `summary`, `social-post`). All still write the old form.
5. **YAML files.** The storage format, proven on `grouping-definitions`, then `traffic-snapshot` and `form`: read as `.md` or `.yaml`, still written as `.md`.
6. **Alpha R and site release R.** Phases 1 to 5 released, with `@rizom/site-rizom-ai` built on the both-layouts formatter; every brain moved to alpha R and every pin of that site to its release R.
7. **Alpha W, then site release W.** Every moved type's encoder switches to the new form and the old encoders are deleted; seed, recipe and eval content rewritten in the same commit; the quiet rewrite on. Verified on the test apps, then on the smoke brain, then the fleet. Sites formatted by the brain have their `site-content` rewritten in this step. Then `@rizom/site-rizom-ai` opts in with its release W and its sections are rewritten by its site builder.
8. **Freeze.** The registration check refuses a nested header; the old decoders are entered in `docs/legacy-code-inventory.json` with their removal release; the authoring docs state the format and the rule for changing a field; the golden files join the public authoring golden test. `0.2.0` is cut after this phase.

## Supersedes

This plan takes on two items [frontmatter-hygiene.md](./frontmatter-hygiene.md) lists as non-goals: the source-reference shapes and the people on decisions and summaries. `traffic-snapshot` keeps `days` as its stored copy, as that plan has it, in a YAML file. That plan is updated to point here when phase 4 starts.

[public-authoring-api-0.2.md](./public-authoring-api-0.2.md) gains this plan as a gate: the stored format is part of the authoring contract it freezes.

## Non-goals

- Unifying what `content` holds on a read. Body-only, regenerated and stored-bytes reads stay; readers stop depending on the difference because they use metadata.
- YAML scalar style. Quoting follows `js-yaml`; a file written with other quoting is restyled on its first write.
- Trimming fields nobody reads. That is [frontmatter-hygiene.md](./frontmatter-hygiene.md).
- Renaming in-memory metadata. Only the file shape changes.
