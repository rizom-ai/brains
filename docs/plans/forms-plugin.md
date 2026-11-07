# Plan: Forms — one owner for a brain site's public forms

## Status

Proposed 2026-11-07; decisions reviewed with the owner the same day. A reusable `forms` plugin owns every public form on a brain's site, and the `contact` plugin folds into it as its first form. The second form, and the reason to extract now, is The Fourth's brand personality test, today a Tally form at `tally.so/r/e5DLgO` that hellofourth.online links to from the crossroads.

## Goal

A brain offers any number of public forms on its site. Each is defined in the brain and editable in Studio, works without JavaScript, and keeps its submissions in the brain until the owner deletes them. A form is a definition, not code: fields, optional steps, optional scoring towards outcomes, and whether a submission emails the owner. One admission path keeps abuse out of all of them.

## Non-goals

- Forms inside chat (Discord modals, Slack forms): [chat-interface-forms-modals.md](./chat-interface-forms-modals.md) stays parked and separate.
- A form builder UI. Definitions are entities, edited in Studio like any other.
- Payments, file uploads, and branching beyond step order.
- Lead qualification. Responses may later feed [lead-management.md](./lead-management.md), which reads only mail today.

## What exists today (fact-check)

`plugins/contact` (`@brains/contact`) is a compound package: the `contact-request` entity plugin and the `contact` service plugin, which depends on `notifications`, `site-builder`, `studio` and `unified-inbox`. It is in no bundle; a brain turns it on with `add: [contact]` (`packages/brain-cli/src/model/canonical-brain.ts`). Only rizom.ai uses it: the `rizom-ai` test app and rizom.ai's fleet entry.

- **Routes.** `GET /contact`, `POST /contact` and `GET /contact/thanks`, public and served on the preview origin too. They answer 503 until the plugin is ready and its daily maintenance is fresh.
- **Rendering.** Each GET issues a submission token, so the form is rendered per request, never at build time. The plugin registers its pages with the site builder (`siteBuilderRouteRegisterContract`, template `contact:page`, a `data-site-slot="contact"` placeholder). The site builds the surrounding page in its own layout, and the webserver fills the slot with the plugin's HTML at request time, falling back to the plugin's own page. rizom.ai has no contact page of its own.
- **Admission.** Origin and same-site checks; a body capped in bytes and read time, with a hard-coded field whitelist; a honeypot (`website`); network identity from the socket peer (IPv4 /24, IPv6 /64), never headers; one runtime-state ledger (`contact.admission`) with fixed-window global and per-network limits on requests, forms and submissions; 32-byte tokens stored hashed; HMAC dedup giving identical retries one record and changed retries a 409. No captcha.
- **Storage.** `contact-request` entities, restricted, not embeddable, not searchable, never projection sources or model input. The frontmatter holds name, email, received and expiry times, `status: new | handled` and `notification: pending | sent | failed`; the message is the body. Default retention is one day (90 days at most), with caps of 50 records and 500 KB in a runtime-state slot ledger (`contact.storage`). Daily maintenance deletes expired records, and intake closes if maintenance is failed or stale.
- **Delivery.** A durable `notify` job sends `notificationsSendContract` with a generic title and an authenticated Inbox link, never the submitted fields. Attempts are bounded and leased. A failed notification keeps the request, and health stays degraded until it is handled.
- **Inbox.** A `contact-requests` source in the unified inbox: new requests as items, an admin-only plain-text detail, a "Done" action that marks the request handled.
- **Coupling.** `shared/site-atlas`'s homepage opening finds the form by `pluginId === "contact"` and `/contact`. rizom.ai's content links `/contact?topic=…`, which prefills the message, and `sites/hub` links `https://rizom.ai/contact`.
- **Contact-specific vs generic.** Generic: network identity, bounded bodies, origin and preview handling, the admission ledger and token mechanics, the slot and delivery mechanics, the maintenance and health pattern. Contact-specific: the fixed submission schema, the `contact-request` entity, the paths, slot and template names, all copy, the `contact-` id prefix, the `contact.*` state namespaces, one plugin-wide policy, and the site-atlas lookup.

[public-ask.md](./public-ask.md) Slice D records why contact was built this way. Its rules carry over to every form except two the decisions below change: responses are kept until the owner deletes them, and the notification email carries the submission.

## Decisions

### Contact folds in

`plugins/contact` and the catalog id `contact` are removed, not kept as an alias. Contact becomes a form on the forms plugin with the same fields, copy and paths (`/contact`, `/contact/thanks`, `?topic=` prefill), so every existing link keeps working.

### A form is a definition

A definition has:

- an `id`, a `path` (default `/forms/<id>`), a `title`, an `intro`, a `submitLabel` and thanks copy;
- `steps`: one or more, each a list of fields;
- fields of kind `text`, `longText`, `email`, `choice` or `choices`, each with an `id`, a `label`, `required`, a maximum length and, for choices, `options`;
- optional `scoring`: an option names the `outcome` it counts towards, with a weight (default 1), plus `outcomes` with a title and copy each;
- `notify`: whether a submission emails the owner, and the email's title;
- per-form admission limits, defaulting to contact's;
- `translations`, per language, for every visible string.

Field ids `token` and `website` are reserved for the token and the honeypot.

The plugin ships contact as a built-in definition, so rizom.ai's cutover needs no content change. From Phase 2, a `form` entity in the brain defines further forms or overrides a built-in one, the way saved site content overrides a section's built-in copy.

### Rendering stays request-time and slot-filled

Each form registers its pages with the site builder as contact does. The plugin renders semantic HTML with stable class names (`form`, `form__step`, `form__field`, `form__choice`, `form__outcome`) into the page's slot, and the site styles them in its own CSS. Without JavaScript, every step renders as a fieldset on one page and the post works. A small script served by the plugin then shows one step at a time.

### The outcome is the server's

The server validates a submission against the form's definition: unknown fields, missing required ones and options not on the list fail with per-field errors and the draft re-rendered. Scoring also runs on the server. The 303 after a successful post carries an opaque receipt, valid for the receipt lifetime, and the thanks page shows that response's outcome. Submitted fields never appear in a URL.

### One entity type, kept until deleted

Every form stores its responses as one entity type, `form-response`, with the form as a field. A form is data, defined in code or content, and every response has the same shape; answers are validated against the definition at submission, so the stored type needs no knowledge of any one form. One type keeps the privacy rules in one place, lets a form added in Studio work without a restart, and Studio groups responses by `form`. A type per form would need entity types registered while the brain runs.

A `form-response` keeps contact-request's privacy guarantees: restricted, not embeddable, not searchable, never knowledge or model input. Its frontmatter holds the form id, the answers, the outcome, the received time, `status` and `notification`. Each answer is a snapshot of what the visitor saw: the field id, the label as shown and the value or option text chosen, and the outcome's title as shown. Later edits to the form never make an older response unreadable or change what it says. Studio shows the answers as provenance and leaves the status editable.

Responses are kept until the owner deletes them in Studio or the Inbox. Nothing expires on its own and there is no record cap, so nothing is lost unread; each form says on the page that responses are kept until they have been dealt with. Admission's per-hour submission limits bound growth. Contact's one-day expiry, its record and byte caps, and the daily deletion go; maintenance keeps re-enqueuing pending notifications. Admission counters are kept per form under `forms.*` runtime-state namespaces, with global limits shared across forms.

### The email carries the submission

Each form decides whether a new response sends an email (contact: on; a busy quiz may leave it off and only collect in the Inbox). The email carries what was submitted: each answer under its label, the outcome for a scored form, and the Inbox link for marking it done. When the form asks for an email address, the notification's Reply-To is the sender, so the owner answers from the mailbox. The notifications contract gains an optional `replyTo`, passed through to the email transport. Copies of a submission therefore live with the email provider and in the mailbox, outside the brain's deletion. The `notify` job keeps its guarantees: durable, leased, bounded attempts, and a failed notification keeps the response.

### One Inbox source

One unified-inbox source, "Form responses", lists new responses titled by their form; the admin detail shows each answer under its label; "Done" marks a response handled.

### Well-known routes by role

The site atlas finds the contact form by a route role, not by plugin id, as #822 did for other well-known routes.

## Phases

### Phase 1 — Forms with contact on it

- `plugins/forms`: definition schema, the built-in contact definition, routes and slot per form, generic admission, delivery, maintenance, health and Inbox, all keyed by form. The contact plugin's code moves here rather than being rewritten, and its tests come along as the contact form's tests; the expiry, deletion and capacity tests go with the behavior.
- The `form-response` entity type with answer snapshots, kept until deleted.
- Notifications with the submission and Reply-To: `replyTo` on the notifications contract and the email transport.
- Migration on first start: existing `contact-request` records (at most 50, a day old by default) become `form-response` records for `contact` with their status and notification state and no expiry, then the originals are deleted. `contact.*` runtime state is retired: open tokens expire within 30 minutes.
- The site atlas lookup by role. The catalog id `forms` replaces `contact`. The `rizom-ai` test app and rizom.ai's fleet entry change `add: [contact]` to `add: [forms]`.
- Docs: the plugin README, `entity-types-reference.md`, `architecture-overview.md`, public-ask Slice D, and contact's slot in step 7 of [authoring-boundary-reapply.md](./authoring-boundary-reapply.md).

Done when rizom.ai's `/contact` works in production through the forms plugin, open requests appear as responses in the Inbox, and `plugins/contact` is gone.

### Phase 2 — Forms defined in the brain

- The `form` entity type, editable in Studio, defining new forms at their own paths and overriding built-in ones.
- `choice` and `choices` fields; per-form limits and the email switch.

Done when a test app defines a second form in its content and it works end to end.

### Phase 3 — Steps, scoring, outcomes and translations

- Multi-step rendering with the progressive script, scoring and outcomes on the server, the outcome on the thanks page.
- `translations`: the form renders in the page's language; `/zh-tw/<path>` follows [bilingual-sites.md](./bilingual-sites.md).

Done when a scored, two-language test form shows the right outcome in both languages, with and without JavaScript.

### Phase 4 — The Fourth's brand test

- The brand test as a `form` definition in The Fourth's brain, at `/zh-tw/brand-test` in Traditional Chinese and `/brand-test` in English, styled in the Paper theatre CSS. Sam's Chinese is the source; I draft the English for Sam and Becca to correct. Whether a response emails them is Sam's call.
- The crossroads' "Take the test →" points to `/brand-test`; the Tally form is retired.
- Deploy order: the brain release with the forms plugin first, then the definition in content. An identity or definition field the running brain does not know is rejected on import.

Needs from Sam: every question on all five pages, how each answer counts towards a type, and each outcome's copy.

Done when a visitor on hellofourth.online takes the test in either language, sees their outcome, and the response is in The Fourth's Inbox.

## Validation

- Unit: the definition schema; answer validation (unknown, missing, off-list, too long, reserved ids); server scoring; answer snapshots; per-form admission counters under shared global limits.
- Carried over: every contact behavior the current suite covers that stays, now as the contact form: no-JavaScript GET/POST/303, origin and media-type checks, streamed body caps, topic prefill, dedup and conflict, rate limits, delivery leases, Inbox actions, and private records kept out of search, projections and model calls.
- Kept until deleted: a response survives maintenance indefinitely; deleting it in Studio removes it.
- Delivery: the email carries every answer and the outcome; Reply-To is the submitted address when there is one; a form with email off sends nothing.
- Snapshot: after a definition edit renames a field and removes an option, an older response still reads as submitted.
- Migration: a fixture of contact requests becomes the same number of responses with their fields, status and notification intact and no expiry, and leaves no contact requests behind.
- Site: a form posts without JavaScript; with it, steps work; the outcome on the thanks page equals the stored one; the atlas door still appears beside the contact form.
- Live: rizom.ai's contact form after Phase 1, and The Fourth's brand test after Phase 4, submitted on the production sites.
