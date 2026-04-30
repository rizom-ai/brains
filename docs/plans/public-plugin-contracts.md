# Plan: Public Plugin Contracts

## Status

Draft. This plan supersedes hand-maintained copies of internal runtime types in the external plugin API surface.

## Problem

The current public plugin type files are partly handwritten. That is acceptable for small stable types, but unsafe for rich service/context objects when the definitions are copied from internal packages:

- copied shapes drift as internal types evolve
- drift can create confidently wrong plugin-author types
- exposing internal `@brains/*` types would freeze package boundaries we do not want public
- replacing everything with `unknown` avoids false precision but gives authors a poor API

The public plugin API needs a contract that is precise, stable, and decoupled from internal storage/runtime objects.

## Direction

Make the public surface **declarative and contract-first**.

A Zod schema is the source of truth for each public plugin-facing DTO or context payload. Public TypeScript types are inferred/generated from those schemas. Internal services adapt their real internal shapes into these public DTOs before crossing the plugin boundary.

```text
internal runtime/storage type
        ↓ adapter
public Zod schema  ──→ public TypeScript type / published .d.ts
        ↓
runtime validation at boundary/tests
```

The public schema describes the external contract, not the internal implementation.

## Goals

- Prevent type drift between public runtime values and published `.d.ts` files.
- Keep `@rizom/brain/*` public contracts free of `@brains/*` imports.
- Avoid leaking shell internals, service singletons, DB rows, or persistence-specific records.
- Keep public DTOs intentionally smaller than internal types when appropriate.
- Make public compatibility reviewable through schema diffs.
- Add compile and runtime tests that fail when adapters or declarations drift.

## Non-goals

- Do not publish internal `@brains/*` packages as plugin-author dependencies.
- Do not force internal service/storage types to match public plugin DTOs.
- Do not expose `IShell`, context factories, plugin manager internals, registries, DB helpers, or test harnesses.
- Do not solve runtime plugin semver negotiation here; package `peerDependencies` remain the compatibility source of truth during alpha.

## Contract model

For each public object crossing the plugin boundary, define one of these shapes:

1. **Public DTO schema**
   - Stable object shape intended for plugin authors.
   - Backed by Zod.
   - Type exported with `z.infer` or generated declarations.
   - Example categories: conversation summaries, message views, entity references, daemon status, route metadata.

2. **Opaque handle**
   - Public type that intentionally hides internals.
   - Used when authors should pass a value around but not inspect internals.
   - Prefer branded/minimal interfaces over fake internal copies.

3. **Callback/function contract**
   - Public method signatures on plugin contexts.
   - Inputs and outputs use public DTO schemas or opaque handles only.

4. **Explicit `unknown` boundary**
   - Used only for truly plugin-defined payloads or external data.
   - Must be documented as intentionally unconstrained.

## Implementation phases

### 1. Audit current public types

Review `packages/brain-cli/src/types/*.d.ts` and classify each exported type:

- keep as stable public contract
- replace with schema-derived public DTO
- replace with opaque handle
- relax to documented `unknown`
- remove from public surface

Flag any type that hand-mirrors an internal object, especially conversation, message, entity-service, daemon, route, or shell context shapes.

### 2. Add public contract schemas

Create a public-contract module owned by `@rizom/brain`, not by shell internals. Candidate location:

- `packages/brain-cli/src/contracts/`

Each contract exports:

- `SomeViewSchema`
- `type SomeView = z.infer<typeof SomeViewSchema>`
- optional adapter input/output tests

Schemas may import `z` from the curated utility surface, but must not import internal service/storage types.

### 3. Add internal adapters

Where internal services expose data through plugin contexts, add adapter functions near the boundary:

```ts
function toConversationView(record: InternalConversation): ConversationView {
  return ConversationViewSchema.parse({
    id: record.id,
    title: record.title ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
```

Adapter placement rule:

- internal packages may depend on public contract schemas if needed
- public contract schemas must not depend on internal packages

### 4. Generate or derive declarations

Replace handwritten rich shapes with declarations produced from the public contract source of truth.

Acceptable first step:

- colocate schemas and `z.infer` types
- export those exact types through public entry files
- keep thin `.d.ts` wrappers only where packaging requires them

If packaging still requires static `.d.ts` files, add a generation/check step that fails when generated output differs from committed declarations.

### 5. Test drift structurally

Add tests at three levels:

- public fixture plugin typechecks against `@rizom/brain/*`
- adapter outputs validate against public schemas
- committed public declaration output matches generated output, if declarations are generated

Tests should use package-local fixtures and avoid relative cross-package imports from fixtures.

### 6. Document the rule

Update external plugin docs and `external-plugin-api.md` with:

- public types are contract DTOs, not internal records
- do not hand-copy internal types into public `.d.ts`
- add or change public schema first, then adapt internals
- breaking public schema changes require explicit compatibility review

## Acceptance criteria

- No public plugin `.d.ts` file hand-mirrors complex internal runtime/storage shapes.
- Public plugin declarations contain no `@brains/*` imports.
- Public contract schemas exist for rich plugin-facing DTOs.
- Internal-to-public adapters validate against those schemas in tests.
- The external plugin fixture compiles against the public API.
- A drift check fails if generated public declarations and committed declarations diverge.

## Open questions

- Should public contract schemas be exported at runtime for plugin authors, or only their inferred types?
- Should adapters validate in production, development only, or tests only?
- Which current plugin context methods need DTO boundaries first?
- Do we need a small codegen tool now, or can `z.infer` plus type tests cover the first iteration?
