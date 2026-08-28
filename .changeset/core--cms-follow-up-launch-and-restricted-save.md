---
"@brains/studio": patch
"@brains/email-workflows": patch
---

Stop the CMS workspace URL canonicalisation from clobbering follow-up launches:
it replaced the route while the operator was navigating away, so a launched
destination was rewritten back to the workspace and its handoff state discarded
— note capture lost its prefill and chat lost its composer text entirely,
because a non-CMS target reloads after the replace has already won.
Canonicalisation now runs only while the workspace is still the open route.

Strip the system `visibility` key before domain frontmatter validation on entity
create and update. It is read for policy and then left in the payload, so any
non-public entity with a strict frontmatter schema — `mail-item` and
`email-reply-draft` among them — failed to save with `Unrecognized key:
"visibility"`.

Narrow the `draft-reply` follow-up predicate to item shape alone; testing
`sourceId` against a known source reintroduced the coupling the follow-up
registry exists to remove.
