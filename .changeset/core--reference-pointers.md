---
"@brains/reference": patch
"@rizom/brain": patch
"@brains/atproto-client": patch
---

A brain can point to what another brain publishes. A `reference` is created from the address of an entity on its author's brain: the capture finds the author's AT Protocol repo, reads the record for that address, takes the byline from the author's brain card, and writes a draft holding the display fields and where the entity lives. The record's body is never stored. Publishing the draft is the choice to feature it.

Every day each reference is checked against its record. A changed record updates the entry's fields and byline in place; a record that is gone marks the entry withdrawn and asks for one site rebuild; a record that returns makes it active again. A failure to reach the author changes nothing. A request a PDS refuses now fails with its status and error code (`AtprotoRequestError`).

A site shows the selection with the `references:list` section on the `references:entities` data source: each entry's series, author and date, its title and the author's own summary, linking to the entity on its author's site, newest first. A production build shows only published entries whose source is active; a preview also shows drafts; a withdrawn entry appears in neither.

A reference can point to a post, a deck, a project or a series. A post shows its series as its kicker; the others show what they are.

References are an added capability: a brain that features other brains' work lists `references` under `add` in `brain.yaml`.
