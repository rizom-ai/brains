---
"@brains/entity-service": minor
"@brains/plugins": minor
"@brains/core": patch
---

Add `operatorEntities` to the service setup context: editing the brain's records on somebody's behalf, for a console that edits every entity type and declares none.

A package's own writes are scoped to the types it declares because a job has nobody it acts for — writing another package's material there is a package helping itself to it. A console is the other case. It has a caller by construction, so this takes one on every call and asks the brain's entity-action policy from it. The console cannot forget the check or supply a level it was not given: a route declared `security: { kind: "protocol" }` receives an `InterfaceCaller` and a public one receives `null`, so a surface with no caller cannot reach the capability at all.

`applyEntityDelete` joins `applyEntityEdit` in `@brains/entity-service` and `system_delete` now sits on it. Extracting it closed a live gap: the tool refused to delete a singleton and the studio editor did not, so a console could remove the brain's one identity record where a tool would not. The tool keeps its own singleton refusal ahead of the confirmation gate, so a fabricated confirmed call is still refused with a message about singletons rather than about a missing token.

Deleting through the capability also reports what became of the attempt — deleted, not found, or denied with the reason — rather than a bare boolean, because a console answers a refusal with the reason and a conflict with the current version.
