# Plan: Forms — an engine for a brain site's public forms

## Status

Proposed 2026-11-07; decisions reviewed with the owner the same day. A reusable `forms` engine runs every public form on a brain's site, and each form's submissions become a domain entity owned by the package whose type it is. `contact` is rebuilt on the engine, and a new `quiz` package owns the results of scored forms. The first quiz is The Fourth's brand personality test, today a Tally form at `tally.so/r/e5DLgO` that hellofourth.online links to from the crossroads.

## Goal

A brain offers any number of public forms on its site. Each works without JavaScript and is defined in code or in the brain, where Studio edits it. Its submissions become real entities in the brain: a contact form produces contact requests, a quiz produces quiz results. They stay until the owner deletes them. One admission path keeps abuse out of every form.

## Non-goals

- Forms inside chat (Discord modals, Slack forms): [chat-interface-forms-modals.md](./chat-interface-forms-modals.md) stays parked and separate.
- A form builder UI. Definitions are entities, edited in Studio like any other.
- Payments, file uploads, and branching beyond step order.
- Lead qualification. When [lead-management.md](./lead-management.md)'s opportunities exist, a contact request may become a lead; that step belongs to that plan.

## What exists today (fact-check)

`plugins/contact` (`@brains/contact`) is a compound package: the `contact-request` entity plugin and the `contact` service plugin, which depends on `notifications`, `site-builder`, `studio` and `unified-inbox`. It is in no bundle; a brain turns it on with `add: [contact]` (`packages/brain-cli/src/model/canonical-brain.ts`). Only rizom.ai uses it: the `rizom-ai` test app and rizom.ai's fleet entry.

- **Routes.** `GET /contact`, `POST /contact` and `GET /contact/thanks`, public and served on the preview origin too. They answer 503 until the plugin is ready and its daily maintenance is fresh.
- **Rendering.** Each GET issues a submission token, so the form is rendered per request, never at build time. The plugin registers its pages with the site builder (`siteBuilderRouteRegisterContract`, template `contact:page`, a `data-site-slot="contact"` placeholder). The site builds the surrounding page in its own layout, and the webserver fills the slot with the plugin's HTML at request time, falling back to the plugin's own page. rizom.ai has no contact page of its own.
- **Admission.** Origin and same-site checks; a body capped in bytes and read time, with a hard-coded field whitelist; a honeypot (`website`); network identity from the socket peer (IPv4 /24, IPv6 /64), never headers; one runtime-state ledger (`contact.admission`) with fixed-window global and per-network limits on requests, forms and submissions; 32-byte tokens stored hashed; HMAC dedup giving identical retries one record and changed retries a 409. No captcha.
- **Storage.** `contact-request` entities, restricted, not embeddable, not searchable, never projection sources or model input. The frontmatter holds name, email, received and expiry times, `status: new | handled` and `notification: pending | sent | failed`; the message is the body. Default retention is one day (90 days at most), with caps of 50 records and 500 KB in a runtime-state slot ledger (`contact.storage`). Daily maintenance deletes expired records, and intake closes if maintenance is failed or stale.
- **Delivery.** A durable `notify` job sends `notificationsSendContract` with a generic title and an authenticated Inbox link, never the submitted fields. Attempts are bounded and leased. A failed notification keeps the request, and health stays degraded until it is handled. The contract has no reply-to field.
- **Inbox.** A `contact-requests` source in the unified inbox: new requests as items, an admin-only plain-text detail, a "Done" action that marks the request handled.
- **Coupling.** `shared/site-atlas`'s homepage opening finds the form by `pluginId === "contact"` and `/contact`. rizom.ai's content links `/contact?topic=…`, which prefills the message, and `sites/hub` links `https://rizom.ai/contact`.
- **Contact-specific vs generic.** Generic: network identity, bounded bodies, origin and preview handling, the admission ledger and token mechanics, the slot and delivery mechanics, the maintenance and health pattern. Contact-specific: the fixed submission schema, the `contact-request` entity, the paths, slot and template names, all copy, the `contact-` id prefix, the `contact.*` state namespaces, one plugin-wide policy, and the site-atlas lookup.

No person, lead or opportunity entity exists on `main`; `opportunity` is unmerged work under [bd-priority-engine.md](./bd-priority-engine.md).

[public-ask.md](./public-ask.md) Slice D records why contact was built this way. Its rules carry over to every form except two the decisions below change: submissions are kept until the owner deletes them, and the notification email carries the submission.

## Decisions

### Forms is an engine, not a store

`plugins/forms` owns what every form shares: admission, request-time rendering, validation against the definition, scoring, the notification email, maintenance and health. It stores no submissions. Its only entity type is `form`, for forms defined in content.

### A submission becomes a domain entity

A form names its target: the entity type its submissions become. A package becomes a target by registering with the engine through a typed bus contract (#826): it declares the fields it accepts and stores each accepted submission as its own entity. The target package owns everything about its records:

- their markdown shape;
- their visibility, always restricted for submitted personal data;
- their Inbox source;
- the built-in forms that produce them.

Nothing in the brain is a generic "response".

### Contact stays, rebuilt on the engine

`plugins/contact` shrinks to its domain: the `contact-request` type, the contact form (same fields, copy, `/contact` and `/contact/thanks`, `?topic=` prefill) and its "Contact requests" Inbox source. `add: [contact]` brings in `forms`. Its engine code (admission, slots, delivery, maintenance, rendering) moves to `plugins/forms`. `contact-request` keeps its type, so stored requests need no migration and rizom.ai's fleet entry does not change.

### Quizzes share one result type

A new `quiz` package owns `quiz-result`: which quiz, the outcome as shown, each answer as the visitor saw it (field id, label and the value or option text chosen), and the taker's name and email when the quiz asks for them. Later edits to a quiz never change what an older result says. A result appears in the Inbox as a to-do only when the taker left contact details. Every result is visible in Studio, grouped by quiz. `add: [quiz]` brings in `forms`. The brand test and Rizom's planned Team Type quiz both produce `quiz-result`. Each quiz's own outcomes give a result its meaning.

### A form is a definition

A definition has:

- an `id` and a `target`;
- a `path` (default `/forms/<id>`), a `title`, an `intro`, a `submitLabel` and thanks copy;
- `steps`: one or more, each a list of fields;
- fields of kind `text`, `longText`, `email`, `choice` or `choices`, each with an `id`, a `label`, `required`, a maximum length and, for choices, `options`;
- optional `scoring`: an option names the `outcome` it counts towards, with a weight (default 1), plus `outcomes` with a title and copy each;
- `notify`: whether a submission emails the owner, and the email's title;
- per-form admission limits, defaulting to contact's;
- `translations`, per language, for every visible string.

Field ids `token` and `website` are reserved for the token and the honeypot. A target package ships its built-in forms. From Phase 2, a `form` entity in the brain defines further forms for any registered target or overrides a built-in one, the way saved site content overrides a section's built-in copy.

### Rendering stays request-time and slot-filled

Each form registers its pages with the site builder as contact does. The engine renders semantic HTML with stable class names (`form`, `form__step`, `form__field`, `form__choice`, `form__outcome`) into the page's slot, and the site styles them in its own CSS. Without JavaScript, every step renders as a fieldset on one page and the post works. A small script served by the engine then shows one step at a time.

### The outcome is the server's

The engine validates a submission against the form's definition: unknown fields, missing required ones and options not on the list fail with per-field errors, and the draft is re-rendered. Scoring also runs on the server. The 303 after a successful post carries an opaque receipt, valid for the receipt lifetime, and the thanks page shows that submission's outcome. Submitted fields never appear in a URL.

### Kept until deleted

Submissions stay until the owner deletes them in Studio or the Inbox. Nothing expires on its own and there is no record cap, so nothing is lost unread. Each form says on the page that submissions are kept until they have been dealt with. Admission's per-hour submission limits bound growth. Contact's one-day expiry, its record and byte caps, and the daily deletion go; maintenance keeps re-enqueuing pending notifications. Admission counters are kept per form under `forms.*` runtime-state namespaces, with global limits shared across forms.

### The email carries the submission

Each form decides whether a new submission sends an email. Contact's is on; a busy quiz may leave it off and collect in Studio and the Inbox instead. The email carries:

- each answer under its label;
- the outcome, for a scored form;
- the Inbox link for marking it done.

When the form asks for an email address, the notification's Reply-To is the sender, so the owner answers from the mailbox. The notifications contract gains an optional `replyTo`, passed through to the email transport. Copies of a submission therefore live with the email provider and in the mailbox, outside the brain's deletion. The `notify` job keeps its guarantees: durable, leased, bounded attempts, and a failed notification keeps the submission.

### Well-known routes by role

The site atlas finds the contact form by a route role, not by plugin id, as #822 did for other well-known routes.

## Phases

### Phase 1 — The engine, with contact on it

- `plugins/forms`: definitions, routes and slot per form, generic admission, rendering, validation, delivery, maintenance and health, all keyed by form, and the target contract. Contact's engine code moves here rather than being rewritten; its tests come along.
- `plugins/contact` as a target: `contact-request`, the built-in contact form, its Inbox source. Expiry, record and byte caps, and the daily deletion are removed, along with their tests.
- Notifications with the submission and Reply-To: `replyTo` on the notifications contract and the email transport.
- The site atlas lookup by role.
- Docs: both plugin READMEs, `entity-types-reference.md`, `architecture-overview.md`, public-ask Slice D, and contact's line in step 7 of [authoring-boundary-reapply.md](./authoring-boundary-reapply.md), which gains forms and quiz.

Done when rizom.ai's `/contact` works in production through the engine, its stored requests are untouched, and the email arrives with the message and a working Reply-To.

### Phase 2 — Forms defined in the brain

- The `form` entity type, editable in Studio, defining new forms for any registered target at their own paths and overriding built-in ones.
- `choice` and `choices` fields; per-form limits and the email switch.

Done when a test app defines a second form in its content and it works end to end.

### Phase 3 — Quizzes

- Multi-step rendering with the progressive script; scoring and outcomes on the server, the outcome on the thanks page.
- `translations`: a form renders in the page's language; `/zh-tw/<path>` follows [bilingual-sites.md](./bilingual-sites.md).
- `plugins/quiz` with `quiz-result`: answer snapshots, the Inbox only with contact details, Studio grouping by quiz.

Done when a scored, two-language test quiz shows the right outcome in both languages, with and without JavaScript, and its results land as `quiz-result`.

### Phase 4 — The Fourth's brand test

- The brand test as a `form` definition in The Fourth's brain, targeting `quiz-result`, at `/zh-tw/brand-test` in Traditional Chinese and `/brand-test` in English, styled in the Paper theatre CSS. Sam's Chinese is the source; I draft the English for Sam and Becca to correct. Whether a result emails them is Sam's call.
- The crossroads' "Take the test →" points to `/brand-test`; the Tally form is retired.
- Deploy order: the brain release with the engine and `quiz` first, then the definition in content. The brain rejects on import any entity field the running version does not know.

Needs from Sam: every question on all five pages, how each answer counts towards a type, and each outcome's copy.

Done when a visitor on hellofourth.online takes the test in either language, sees their outcome, and the result is in The Fourth's brain.

## Validation

- Unit: the definition schema; answer validation (unknown, missing, off-list, too long, reserved ids); server scoring; the target contract; per-form admission counters under shared global limits.
- Carried over: every contact behavior the current suite covers that stays, now through the engine: no-JavaScript GET/POST/303, origin and media-type checks, streamed body caps, topic prefill, dedup and conflict, rate limits, delivery leases, Inbox actions, and private records kept out of search, projections and model calls.
- Kept until deleted: a submission survives maintenance indefinitely; deleting it in Studio removes it.
- Delivery: the email carries every answer and the outcome; Reply-To is the submitted address when there is one; a form with email off sends nothing.
- Quiz: after a definition edit renames a field and removes an option, an older result still reads as submitted; a result with contact details is an Inbox item, one without is not.
- Site: a form posts without JavaScript; with it, steps work; the outcome on the thanks page equals the stored one; the atlas door still appears beside the contact form.
- Live: rizom.ai's contact form after Phase 1, and The Fourth's brand test after Phase 4, submitted on the production sites.
