---
"@brains/plugins": patch
"@brains/sdk": patch
---

The export ledger promises only what an entry point exports

The ledger check ran one way: every export had to be classified. Nothing checked
the other direction, so it could promise a name no consumer can import, and the
failure landed on whoever tried.

The reverse check is now part of the ledger test, reporting every entry at once.
It found 15 names. Thirteen are the input types of stable helpers and are now
exported: `EntityDefinitionConfig`, `EntitySeedDefinition` and
`EntitySeedTrigger` from the entities entry, and `OperatorCardBlock`,
`OperatorViewStatus` and the eight `WorkspaceActionForm*`/`WorkspaceActionResult*`
types from the services entry. An author who lifts a seed, a form field map or a
result declaration out of the call needs a name for it.

The rest are delisted rather than restored. Eleven message and permission types
on the interfaces entry were never exported there, on `main` either, and no
package imports them; two widget component types on the UI entry are the same.
