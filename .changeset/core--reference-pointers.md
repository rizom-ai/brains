---
"@brains/reference": patch
"@brains/atproto-client": patch
---

A brain can point to what another brain publishes. A `reference` is created from the address of an entity on its author's brain: the capture finds the author's AT Protocol repo, reads the record for that address, takes the byline from the author's brain card, and writes a draft holding the display fields and where the entity lives. The record's body is never stored. Publishing the draft is the choice to feature it.

Every day each reference is checked against its record. A changed record updates the entry's fields and byline in place; a record that is gone marks the entry withdrawn and asks for one site rebuild; a record that returns makes it active again. A failure to reach the author changes nothing. A request a PDS refuses now fails with its status and error code (`AtprotoRequestError`).
