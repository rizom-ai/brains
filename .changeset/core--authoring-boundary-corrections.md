---
"@brains/sdk": minor
"@brains/plugins": minor
"@brains/core": patch
"@rizom/brain": minor
---

Separate runtime registration authority from extension callback reads. Auth,
inbox-source and attachment readers no longer offer registration methods, and
runtime adapters pass reader objects rather than hiding host objects behind a
narrow type. Remove the unused authoring export of `reconcileEntities`, whose
context parameter exposed the entity service and projection database.

Correct the public test harness to finalize every installed plugin and discard
routes on reset. Requests reuse the schema-bearing SDK request contract instead
of accepting unchecked response generics. Installed jobs can execute a single
validated attempt, and registered text templates can validate and format data.
These helpers do not simulate worker retries or queue terminal hooks. Preserve
harness configuration across reset and report subscription handler failures with
their stable code.

Typecheck and execute the SDK author tests against built public entries and the
packed package. The sign-off examples now run typed entity reads and formatting,
a job and authenticated stateful routes, and conversational callbacks across
independent instances. Correct the authoring guide's obsolete template/view rule
and the remaining golden interface/CLI fixture drift. Make the schema-bound
`oncePending` operation usable across heterogeneous typed job references without
changing runtime input validation.
