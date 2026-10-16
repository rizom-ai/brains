---
"@brains/plugins": patch
---

Make the runtime plugin contexts extend their published counterparts.

The published contexts in `src/public/types.ts` restated the runtime member
lists by hand — a deliberately narrower surface, but one nothing held to the
runtime. Each runtime context (`BasePluginContext`, `ServicePluginContext`,
`EntityPluginContext`, `InterfacePluginContext`,
`MessageInterfacePluginContext`) now `extends` its published counterpart:
members identical on both sides are declared once (in the published type) and
inherited; members declared only internally stay withheld from the SDK; members
redeclared internally refine a weaker published type, checked for assignability
by the compiler.

A published capability the runtime lacks now fails to compile at the context
declaration and at `createBasePluginContext`, instead of shipping. Emitted
types are unchanged — the previous test-based guard for the contexts is
replaced by the declaration-site check, and only the `Plugin` alias (which
cannot carry an extends clause) keeps a test-level assertion.
