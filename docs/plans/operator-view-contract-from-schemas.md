# Operator view: one contract, derived from its schemas

**Proposed.** Needs a decision before any code, because it changes a published
plugin authoring surface.

The operator view contract is declared twice.

`shell/plugins/src/operator/operator-view-contract.ts` is 816 lines holding
**73 hand-written interfaces**, and almost no Zod. It is what an outside plugin
author programs against, and what `@brains/plugins` exports.

`shell/plugins/src/operator/operator-view-runtime.ts` holds **193 Zod
expressions** — the schemas that actually validate what a plugin sends, with
**87 bounded fields**.

## The problem is not drift

The two agree structurally today. The problem is that the interfaces
**understate** the contract, and cannot do otherwise.

A notice block's interface says:

```ts
readonly title?: string | undefined;
readonly details?: readonly string[] | undefined;
```

Its schema says:

```ts
title: labelSchema.optional(),              // trimmed, 1–160 characters
details: z.array(longTextSchema).max(50),   // at most 50, each ≤ 100_000
```

Six shared string bounds carry the whole surface — `identifierSchema` (1–120),
`rowIdentifierSchema` (1–400), `labelSchema` (1–160), `shortTextSchema` (≤500),
`textSchema` (≤4 000), `longTextSchema` (≤100 000) — and none of them is
visible to an author reading the types. They find out when the runtime rejects
a view, which for an outside author is after they have shipped.

The repository already holds the rule this breaks: derive types with
`z.output`, never hand-write a parallel type beside a schema. This is that
violation at 73×.

## What to decide

**Whether the schemas move into the contract module, or the interfaces are
derived where they are.** Recommendation: move the schemas. They _are_ the
contract; the runtime is where they happen to live because that is where
validation was written. A plugin author should be able to read one file.

This is the part that needs sign-off rather than a judgement call, because it
changes what `@brains/plugins` exports and therefore what an outside author
imports.

## Slices

Each slice is one PR, each with a changeset, since `@brains/plugins` is a
published authoring surface.

1. **Move the shared bounds.** The six string schemas and `coordinateSchema`
   into the contract module, re-exported to the runtime. No type changes; this
   is the seam everything else needs.
2. **Derive the leaf blocks.** Notice, text, facts, progress — the blocks with
   no nested blocks. Each interface becomes `z.output<typeof xSchema>` and the
   hand-written one is deleted. Tests: an author type that previously compiled
   and should not, now does not.
3. **Derive the composite blocks.** Group, flow, collection, tabs — the ones
   that nest. These need the schemas to be recursive, which is where this
   could become hard; if `z.lazy` makes the derived types unusable for
   authors, stop and report rather than shipping worse types.
4. **Derive the panel and view.** The top-level shapes.
5. **Delete the parallel declarations** and confirm `@brains/plugins` exports
   the derived types under the same names.

## Validation

- Per slice: `turbo run test --filter @brains/plugins`, `turbo run typecheck`,
  `bun scripts/lint.mjs --force --filter @brains/plugins`, `bun run
changeset:check`, and `bun run arch:check`.
- The eight external authoring fixtures must pass unchanged at every slice —
  they are the only check that an outside author's code still compiles.
- After slice 5: one declaration per block, and the bounds visible to anyone
  reading the type.

## Risk

The fixtures are the real gate, not the unit tests. If slice 3 cannot produce
author-usable types from recursive schemas, the honest outcome is slices 1–2
plus a note, not a worse contract than we started with.
