# Plan: Public Plugin Contracts

## Status

In progress. Core decisions made. Declaration generation is wired for published subpaths, migrated public declarations are generated from source, and the remaining `packages/brain-cli/src/types/site.d.ts` file is a tracked legacy site surface.

## Problem

Hand-written public `.d.ts` files copied from internal types drift as internals evolve. Drift produces confidently wrong plugin-author types — typecheck passes, runtime values don't match. Examples surfaced this round:

- public `Conversation` declared `createdAt`/`updatedAt` and `metadata: string | null`; the runtime now hoists `channelName` to a top-level field and parses metadata to an object.
- public `InterfacePluginContext.agentService` exposed an internal service shape instead of a curated namespace.
- public daemon health type used internal field types (`Date`) that the runtime translator emits as ISO strings.

Hand-editing the stubs to fix these is symptom-patching. The fix is to stop hand-writing them at all.

## Direction (decided)

- **Zod schemas in `shell/plugins/src/contracts/` are the source of truth** for every public DTO crossing the plugin boundary. Public TS types come from `z.infer<typeof Schema>`.
- **Manual `.d.ts` stubs are deleted for migrated subpaths.** Published declarations are derived from source via a build step. No human-edited public plugin-author types.
- **Translators in `shell/plugins/src/base/public-*.ts`** convert internal/runtime shapes to contract shapes at the boundary (DB row → parsed metadata, column renames, `Date` → ISO string, internal method names → namespace method names). Translators are the runtime half of the contract; the schema is the typing half.
- **Bare names for public types** (`Conversation`, `Message`, `AppInfo`); internal types carry an explicit prefix or suffix. Pick one and apply uniformly — see open work.
- **Validation happens at seams, not per-request.** Schemas validate at test boundaries and untrusted-input edges. Translator outputs cross the boundary by structural typing; no per-request `.parse()`.
- **No internal `@brains/*` imports in published declarations.** This is the structural test.

## Current slice

Declaration-generation infrastructure is in place. Do **not** expand, redesign, or hand-patch public context/API surface beyond contract-backed exports until follow-up slices add those contracts deliberately.

This slice is complete when:

- `packages/brain-cli/src/types/` is gone for plugin-author subpaths that have moved to generated declarations.
- `packages/brain-cli/src/entries/*.ts` are the public API source files for generated `@rizom/brain` subpaths.
- the build emits declarations from those real source files.
- generated/published declarations contain no `@brains/*` imports.
- the package-local external plugin fixture typechecks against the generated/published plugin contract surface only.

Current first pass: published declarations are generated and clean of internal `@brains/*` imports. Several surfaces are intentionally narrowed to contract exports while declaration bundling is proven. `ServicePlugin` has been added back through a real public wrapper with generated declarations; remaining base classes and richer context/capability APIs are added back only after they can generate clean declarations without leaking internals.

If generation exposes leaks or unusable types, shrink the entry export surface. Do not replace generated declarations with handwritten interfaces, casts, broad `unknown` placeholders, or copied `.d.ts` blocks.

## Path forward

The iterative shape:

1. **Delete manual stubs for generated subpaths and wire declaration generation together.** Remove `packages/brain-cli/src/types/*.d.ts` for each migrated subpath and replace the copy step with generated declarations from `packages/brain-cli/src/entries/*.ts`. These land together; the published package must always have types. `site` remains a separate legacy surface until its site-package graph is migrated.

2. **Expose less first.** When generation reveals internal leakage (imports of `@brains/*`, transitive type graphs), the answer is to **shrink what `entries/*.ts` re-exports**, not to patch the generated output. For the first clean pass, prefer contracts-only exports over wholesale `@brains/plugins` re-exports.

3. **Add back iteratively after generation is clean.** One namespace or DTO at a time. Each addition: contract schema in `contracts/`, translator if internal shape differs, exposure via the right entry. Generated declarations prove the addition is clean. If something can't go through cleanly, the answer is contract redesign, not stub patching.

## Goals

- Public declarations contain no `@brains/*` imports.
- Public declarations are byte-identical to what the build emits from source.
- Adding a public field requires editing one file (the schema).
- The external plugin fixture typechecks against the published surface end-to-end.

## Non-goals

- Publishing internal `@brains/*` packages as plugin-author dependencies.
- Forcing internal storage/runtime types to match public DTOs.
- Exposing `IShell`, factories, registries, plugin manager internals, DB helpers, or test harnesses.
- Solving runtime plugin semver negotiation; `peerDependencies` remains the alpha mechanism.

## Open work

- **Generation mechanism follow-through.** Keep declaration bundling as the source of published `.d.ts` output. Constraint: published `.d.ts` is self-contained (no `@brains/*` imports) and matches what the schemas/contracts declare.
- **Internal naming convention.** Currently mixed: `RuntimeAppInfo`, `ConversationRow`, `RuntimeAgentResponse`. Pick `Runtime*` prefix or `*Row` suffix and apply across all internal types that have a public counterpart.
- **`metadata: z.record(z.unknown())` policy.** Each contract that exposes a `metadata` bag is a future drift point. Decide: every meaningful metadata field is hoisted to a typed top-level field, OR `metadata` is an explicit "do not depend on this" escape hatch documented as such.
- **Schemas vs interfaces consistency.** Data DTOs are zod schemas; the `AgentNamespace` callable API is a TS interface. Commit to "schemas for data, interfaces for callable APIs" as a documented rule, or unify on schemas.
- **Test-introspection cleanup.** Plugins still expose state for tests to read (e.g., `autoExtractionEnabled`), and the projection layer accommodates this via a `before` lifecycle hook. Replace with observable-behavior tests, then drop the hook.
- **Next context surface to migrate.** Daemon registration, tool registration, route registration, or another. Pick one and apply the iterative path.

## Acceptance criteria

- Migrated plugin-author subpaths no longer have files in `packages/brain-cli/src/types/`; the remaining legacy `site` surface is tracked separately.
- Generated/published declarations contain no `@brains/*` import paths.
- The external plugin fixture (`packages/brain-cli/test/fixtures/external-plugin/`) typechecks against the published surface only.
- A CI check fails if generated declarations diverge from source-of-truth (or, equivalently, generation is part of the build and there are no committed declarations to drift against).
- Adding a field to a public DTO requires editing exactly the schema file; published declarations regenerate.
