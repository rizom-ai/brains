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

## What deriving can and cannot fix

Proven with a throwaway probe before slice 2, because it changes what this
plan is worth:

**A derived type does not carry its bounds.** `z.output` of
`z.string().max(160)` is `string`. Zod erases refinements, so an author
hovering the derived type sees exactly what they saw before. This plan's
original promise — "the bounds visible to anyone reading the type" — is not
achievable, and no arrangement of `z.output` makes it achievable.

What deriving does fix is real but different: three declarations collapse to
one, and the remaining duplication becomes un-driftable. Under
`--isolatedDeclarations` an exported derived type drags its schema into the
`.d.ts`, so each schema needs an explicit `z.ZodObject<{…}, z.core.$strict>`
annotation. That annotation names the Zod _kinds_ and never the bounds — the
limits stay in the value alone — and `tsc` checks it against the schema on
every build, which an interface in another file never was.

**The bounds become reachable rather than visible.** They are readable beside
the shape in the file an author already opens, and once slice 6 exports the
view schema an author can `safeParse` their view in their own tests instead
of learning the limit from a rejected view in production. That is the actual
remedy for shipping-then-finding-out, and it was not in this plan before.

Two mechanics also settled by the probe: `.readonly()` on the arrays and the
object preserves the contract's `readonly` exactly — assignability holds in
both directions against the hand-written interface — and `.strict()` requires
`z.core.$strict` as the annotation's second parameter.

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

2. **Derive the leaf blocks' contract types.** ✅ Shipped. Tone, scalar,
   stats, key-values, notice and text — the blocks with no nested blocks —
   now live in the contract module as annotated schemas, and their six
   interfaces are `z.output` of them. The runtime aliases each under its
   short local name. Meters and progress are held back to slice 3: their
   item schema carries a `superRefine`, and whether that survives an
   `isolatedDeclarations` annotation is its own question.

3. **Meters and progress.** ✅ Shipped. The `superRefine` that slice 2
   flagged as an open question is not one: in Zod 4 it returns the same
   `ZodObject`, so the annotation is unchanged by it and the cross-field rule
   moves intact. Progress now uses `operatorCoordinateSchema` rather than
   respelling the same unit interval.

4. **The `Runtime*` leaf types.** ✅ Shipped. All eleven were identical to
   their contract counterparts field for field, so each became a name for
   that type rather than a second declaration. No pair differed, so none had
   to be argued for. The names stay exported and nothing that renders a view
   was touched.

5. **Derive the composite blocks.** Group, flow, collection, columns, region,
   card, tabs — the ones that nest. These need the schemas to be recursive,
   which is where this could become hard; if `z.lazy` makes the derived types
   unusable for authors, stop and report rather than shipping worse types.

6. **Derive the panel and view**, the top-level shapes, and confirm the 22
   names `public/service-definition.ts` exports still resolve to types with
   the same members. Then export the view schema itself from that module —
   the one addition to the public surface this plan makes, and the one that
   lets an author check a view before shipping it. That slice carries a
   changeset; the earlier ones do not.

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
- After slice 6: one declaration per block, and the bounds visible to anyone
  reading the type.

## Risk

Slice 5 is where this can fail. If recursive schemas cannot produce
author-usable types, the honest outcome is slices 1–4 plus a note, not a
worse contract than we started with.
