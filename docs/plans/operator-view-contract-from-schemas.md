# Operator view: one contract, derived from its schemas

**Active.** The decision this plan opened on is made: the schemas move into
the contract module. Slice 1 is shipped.

## The operator view shape is declared three times

`shell/plugins/src/operator/operator-view-contract.ts` is 816 lines holding
**73 hand-written interfaces**. Twenty-two of them are exported by name
through `src/public/service-definition.ts`, and the rest are reachable
through those, so this is what an outside plugin author programs against.

`shell/plugins/src/operator/operator-view-runtime.ts` holds **74 more
hand-written `Runtime*` interfaces** — the same shapes again, exported
separately from the barrel and used by studio and dashboard to render what
has been parsed.

The same file holds **193 Zod expressions**, the schemas that actually
validate what a plugin sends, with **87 bounded fields**. Only five types in
its 3 270 lines are derived from them.

This plan originally said the shape was declared twice. It is declared three
times, and the third set is as hand-written as the first.

## The problem is not drift

The three agree structurally today — `OperatorStatItem`,
`RuntimeOperatorStatItem` and `z.output<typeof statItemSchema>` are field for
field the same. The problem is that the interfaces **understate** the
contract, and cannot do otherwise.

A notice block's interface says:

```ts
readonly title?: string | undefined;
readonly details?: readonly string[] | undefined;
```

Its schema says:

```ts
title: operatorLabelSchema.optional(),      // trimmed, 1–160 characters
details: z.array(longTextSchema).max(50),   // at most 50, each ≤ 100_000
```

Seven shared bounds carry the whole surface, and none of them was visible to
an author reading the types. They found out when the runtime rejected a view,
which for an outside author is after they have shipped.

The repository already holds the rule this breaks: derive types with
`z.output`, never hand-write a parallel type beside a schema. This is that
violation at 147×.

## Slices

One PR each. A slice that changes what `public/service-definition.ts`
exports carries a changeset; one that only moves declarations behind that
surface does not. Slice 1 is the second kind.

1. **Move the shared bounds.** ✅ Shipped. `operatorIdentifierSchema`,
   `operatorRowIdentifierSchema`, `operatorLabelSchema`,
   `operatorShortTextSchema`, `operatorTextSchema`, `operatorLongTextSchema`
   and `operatorCoordinateSchema` now live in the contract module with the
   shapes they bound, and the runtime aliases them under its short local
   names. Six tests state each limit. No type changed.

2. **Derive the leaf blocks' contract types.** Notice, text, facts, stats,
   progress — the blocks with no nested blocks. Each interface becomes
   `z.output<typeof xSchema>` and the hand-written one is deleted. This
   requires the leaf schemas to move to the contract module alongside the
   bounds, which is the same move slice 1 made, one layer up.

3. **Collapse the `Runtime*` leaf types onto the same source.** They are the
   parsed shape of the schemas the previous slice moved, so they become
   `z.output` of those schemas too rather than a second derivation. If a pair
   turns out to differ for a real reason, that reason gets written down and
   the pair stays split — but a difference nobody can name is duplication.

4. **Derive the composite blocks.** Group, flow, collection, columns, region,
   card, tabs — the ones that nest. These need the schemas to be recursive,
   which is where this could become hard; if `z.lazy` makes the derived types
   unusable for authors, stop and report rather than shipping worse types.

5. **Derive the panel and view**, the top-level shapes, and confirm the 22
   names `public/service-definition.ts` exports still resolve to types with
   the same members.

## Validation

- Per slice: `turbo run typecheck test` across the workspace — **59 files
  author operator views** across `plugins/`, and typecheck over all of them is
  what proves an author's code still compiles. Then `bun scripts/lint.mjs
--force --filter @brains/plugins`, `bun run changeset:check`, `bun run
arch:check`, and both format lanes.
- A previous version of this plan named "eight external authoring fixtures"
  as the gate. There are none; there is no fixtures directory. The 59
  consumers and the full workspace run are the gate, and they are a stronger
  one.
- After slice 5: one declaration per block, and the bounds visible to anyone
  reading the type.

## Risk

Slice 4 is where this can fail. If recursive schemas cannot produce
author-usable types, the honest outcome is slices 1–3 plus a note, not a
worse contract than we started with.
