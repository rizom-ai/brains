---
"@rizom/brain": patch
---

Public forms on a brain's site now run on one engine, and their submissions become the brain's own records. The contact form runs on it unchanged in its paths, copy and `?topic=` prefill, with two changes: contact requests are kept until the owner deletes them (the one-day expiry, the record and byte caps and the daily deletion are gone, and the form says a note is kept until it has been dealt with), and the owner's alert carries the request, each field under its label, with Reply-To the sender. Requests stored before keep working. The notifications contract and the email transport gain an optional `replyTo`.

A brain with a site can define forms in its content: a `form` entity, in the site bundle, holds a definition with steps of text, email, long-text, single-choice and multiple-choice fields, optional scored dimensions, its own limits and alert switch, and translations served at `/<lang>/<path>`. The package whose records a form produces serves it: contact for `contact-request`, and the new `quiz` capability (`add: [quiz]`) for `quiz-result`, a restricted record of each quiz taken that keeps the answers and results as the taker saw them, filed under its quiz, and an Inbox to-do only when the taker left an email. A multi-step form works without JavaScript and shows one step at a time with it; a scored form's thanks page shows its results through an opaque receipt.

Web routes may match by claim, per request, after exact and prefix routes; the site builder asks plugins for the pages they add to each build; and the site atlas finds the contact form by a new `contact-form` route role.
