---
"@brains/plugins": minor
"@brains/sdk": minor
---

A package says what it is, then what it does with it

Everything a package declared sat in one object literal, and TypeScript infers a
literal's context-sensitive properties in the order they are written. A slot
destructuring `state` above `setup` resolved its context while the state type was
still unknown, which fixed `state` to an empty object instead of failing. The
contract carried the rule as a warning: write `setup` first.

`defineServicePlugin`, `defineInterface` and `defineMessageInterface` now take two
arguments. The first is what the package is: `id`, `config`, `setup`, the entity
types it owns, its account settings, and for a message interface its channel. The
second is what it does: tools, jobs, routes, subscriptions, templates and the
rest. The state type is fixed by the first argument before the second is checked,
so behavior slots can be written in any order.

This is a breaking authoring change with no compatibility path, which stable
`0.2.0` has not been released to require. Every built-in package is migrated, and
compile fixtures cover all three families, async setup, extracted handlers, and a
package with no setup at all.

A type-level fix to the single-object form was ruled out rather than skipped:
`setup` and every state-reading slot are context-sensitive, so no annotation lets
a later property inform an earlier one, and `NoInfer` does not apply.
