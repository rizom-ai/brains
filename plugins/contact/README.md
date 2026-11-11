# @brains/contact

A contact form for a brain's site, on the forms engine (`@brains/forms`). The
package is in the canonical catalog for explicit addition and belongs to no
bundle: a brain that adds `contact` gets the form at `/contact` on the engine's
policy, with no configuration. The package default-exports a declarative
service on the forms engine (`createContactPackage()`), which owns the private
`contact-request` type; the canonical brain composes it under the plugin id
`contact`, after `CONTACT_DEPENDENCIES`. There are no public tools.

## What contact owns

- **`contact-request` records.** `contactRequestEntity` declares restricted
  Markdown records: name, email, received time, `status` (`new` or `handled`)
  and `notification` (`pending`, `sent` or `failed`) in the frontmatter, the
  message as the body. Contact details stay out of query metadata: a read hands
  back the whole document, and metadata holds only the title, `receivedAt`,
  `status` and `notification`. Persistence
  rejects any visibility but restricted; embedding, full-text indexing and
  projection sourcing are off. Requests are kept until the owner deletes them.
  A request written before that, with an `expiresAt`, is still read; the field
  is never written again.
- **The target.** `contactRequestTarget` stores what a form submits as a
  contact request and labels its alert. It takes a form that asks `name` (text,
  required) and `email` (email, required), and optionally `message` (long
  text), and alerts the owner; any other form is refused.
- **The contact form.** `CONTACT_FORM`: `/contact` and `/contact/thanks`, the
  copy (including the note that a note is kept until it has been dealt with),
  `?topic=` prefilling the message, the `contact-form` route role the site atlas
  finds it by, and the `Contact` endpoint. Its state keeps the names it had
  before the engine: `contact.admission`, `contact.storage` and
  `contact.maintenance`; its alert key is `contact-notification:<request id>`.
- **The Inbox source.** "Contact requests" lists new requests; admin-only detail
  shows the name, address and message; Done marks a request handled, guarding
  against a concurrent update.

## On the engine

Everything else is the engine's, described in `shared/forms/README.md`:
admission, the in-flight ledger, intake with read-back, the durable `notify`
job, daily recovery, health, rendering and the HTTP boundary. Contact's own
form can be reworded from content: a `form` entity with id `contact` changes its
words and fields, never its path. Other forms in content that target
`contact-request` are served at their own paths.

The owner's alert carries the request: each answer under its label, then the
Inbox link, sent with secret sensitivity and Reply-To the sender's address, so
the owner answers from the mailbox. Copies of a request therefore live with the
email provider and in the mailbox, outside the brain's deletion.

## Configuration

`ContactPluginConfig.intake` takes only the values an owner wants different, in
`http`, `admission` and `delivery` (`FORM_POLICY_DEFAULTS` holds the rest). The
origin, preview host and Inbox destination are the brain's own. Intake depends on
`notifications`, `studio` and `unified-inbox`; configure the recipient and
transport through those plugins.

## Validation

From this package: `bun test` and `bun run typecheck`. From the repository root:
`bun scripts/lint.mjs --force --filter @brains/contact`.

Tests use synthetic requests and temporary local SQLite databases, never live
delivery or hosted model providers. No contact operation calls a model.
