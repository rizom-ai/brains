# @brains/forms

The engine behind a brain site's public forms. A form is a definition; its
submissions become entities of its target's type, stored by the package that
owns that type. The engine stores nothing itself. `@brains/contact` and
`@brains/quiz` run it.

## A form

`formDefinitionSchema` describes one form:

- `id` and `target` (the entity type its submissions become);
- `path` (default `/forms/<id>`; its thanks page is `<path>/thanks`), `title`,
  `pageTitle`, `intro`, `submitLabel` and `thanks` (`title`, `body`,
  `showResults`);
- `steps`, each with an optional `title` and `intro` and its fields: `text`,
  `email`, `longText` (each with `required`, `maxLength`, `autocomplete`),
  `choice` (radio buttons) and `choices` (checkboxes, at most `max`), whose
  options each have a `value` and a `label`; `token` and `website` are reserved;
- optional `scoring`: dimensions, each with its outcomes (`title`, `body`); an
  option counts towards an outcome in a dimension with a `weight` (default 1),
  and each dimension's highest-scoring outcome is its result (a tie goes to the
  outcome listed first);
- `notify` (whether a submission emails the owner, and the email's title);
- `limits`, the form's own admission limits over the plugin's;
- `translations`, per language, of every visible string by id. Whatever a
  translation leaves out stays as written.

Visible copy may name the site's owner as `{owner}`.

In a brain's content a form is a `form` entity (`@brains/form`): its id is the
form's, its frontmatter the rest of the definition, its body the intro
(`parseFormMarkdown`, `formMarkdown`, `formFrontmatterSchema`).

## A target

A package becomes a target by implementing `FormTarget` for its entity type:
whether it can hold a form (`refuse`), the record a submission becomes, whether
a stored record is a given submission, its alert state, whether its owner has
dealt with it, what the owner's alert carries, and how its ids join the form's
id (`-`, or `:` to file records in a folder per form).

## The service

A target's plugin runs one `FormService` with its built-in forms
(`BuiltInForm`: the definition and optionally its own engine wording, a prefill
from the link, legacy state names, an endpoint and a route role). The service
serves the built-in forms at their paths and every form content defines for its
target; a content form with a built-in form's id rewords that form and keeps its
path. Content forms are claimed per request through claim routes, so a form
added in Studio is served without a restart, and their pages come to each site
build through `siteBuilderPagesContract`. A translated form is served at
`/<lang>/<path>`, with the engine's own words in that language (English and
Traditional Chinese), and its pages are built in each language the site has
site-info for.

Per form:

- **Admission** (`forms.<id>.admission`): origin and same-site checks, a body
  capped in bytes and read time with only the form's fields, a honeypot,
  network identity from the socket peer (IPv4 /24, IPv6 /64), fixed-window
  global and per-network limits on requests, forms and submissions, 32-byte
  tokens stored hashed, and HMAC dedup giving identical retries one record and
  changed retries a 409.
- **Intake**: answers validated against the definition with per-field errors,
  the record created conditionally and read back before the visitor is told it
  is saved.
- **The in-flight ledger** (`forms.<id>.storage`): a slot per submission whose
  write or alert has not settled, at most 1000. A sent alert frees its slot; a
  failed one is held until its record is dealt with; a deleted record's slot is
  let go. Submissions are kept until their owner deletes them.
- **Delivery**: a durable `notify` job with the record id only, leased,
  bounded attempts within a retry window, one provider idempotency key per
  record. The alert carries each answer under its label and, for a scored form,
  its results, with Reply-To the submitted email when there is one.
- **Results**: the server scores; the redirect after a scored post carries an
  opaque receipt (`forms.<id>.receipts`, hashed, for the receipt lifetime), and
  the thanks page shows that submission's results unless the form keeps them
  back.

Daily maintenance re-enqueues pending alerts and releases settled slots; intake
closes while it is failed or more than 26 hours old. Health reports counts only.

## Rendering

Forms render at request time into the slot of the site's own page for them,
or into a fallback page on the theme's tokens. The markup is semantic and
works without JavaScript; a small inline script shows a multi-step form one
step at a time. Stable classes: `form`, `form__step`, `form__step-intro`,
`form__field`, `form__field--long`, `form__field--choice`, `form__choice`,
`form__error`, `form__notice`, `form__progress`, `form__back`, `form__next`,
`form__outcomes`, `form__outcome`. The engine's own look starts every rule at
`:where(.form)`, so a site restyles any part with `.form` in front of its
selector.

## Validation

From this package: `bun test` and `bun run typecheck`.
