# Plan: Public Plugin Contracts

## Status

Core decisions made. Declaration generation is wired for published subpaths, public declarations are generated from curated source entries/contracts, and the former site hand-stub has been replaced by a curated generated site entry. Public authoring wrappers now cover `ServicePlugin`, `EntityPlugin`, `InterfacePlugin`, and `MessageInterfacePlugin`.

## Problem

Hand-written public `.d.ts` files copied from internal types drift as internals evolve. Drift produces confidently wrong plugin-author types — typecheck passes, runtime values don't match. Examples surfaced this round:

- public `Conversation` declared `createdAt`/`updatedAt` and `metadata: string | null`; the runtime now hoists `channelName` to a top-level field and parses metadata to an object.
- public `InterfacePluginContext.agentService` exposed an internal service shape instead of a curated namespace.
- public daemon health type used internal field types (`Date`) that the runtime translator emits as ISO strings.

Hand-editing the stubs to fix these is symptom-patching. The fix is to stop hand-writing them at all.

## Direction (decided)

- **Zod schemas in `shell/plugins/src/contracts/` are the source of truth** for every public data DTO crossing the plugin boundary. Public TS data types come from `z.infer<typeof Schema>`.
- **Callable APIs are TypeScript interfaces.** Namespaces such as `AgentNamespace` describe methods over trusted in-process services; they are not runtime data payloads and do not need object schemas unless/until they cross an untrusted boundary.
- **Metadata bags use `ExtensionMetadataSchema`.** They are best-effort extension data, not stable per-key contracts. Hoist any meaningful stable field to a typed top-level schema field before documenting it.
- **Manual `.d.ts` stubs are deleted for migrated subpaths.** Published declarations are derived from source via a build step. No human-edited public plugin-author types.
- **Translators in `shell/plugins/src/base/public-*.ts`** convert internal/runtime shapes to contract shapes at the boundary (DB row → parsed metadata, column renames, `Date` → ISO string, internal method names → namespace method names). Translators are the runtime half of the contract; the schema is the typing half.
- **Bare names for public types** (`Conversation`, `Message`, `AppInfo`); internal/public-boundary aliases use the `Runtime*` prefix (`RuntimeConversation`, `RuntimeMessage`, `RuntimeAppInfo`, etc.) when a public counterpart exists.
- **Validation happens at seams, not per-request.** Schemas validate at test boundaries and untrusted-input edges. Translator outputs cross the boundary by structural typing; no per-request `.parse()`.
- **No internal `@brains/*` imports in published declarations.** This is the structural test.

## Current slice

Declaration-generation infrastructure is in place. Do **not** expand, redesign, or hand-patch public context/API surface beyond contract-backed exports until follow-up slices add those contracts deliberately.

This slice is complete when:

- the legacy source type-stub directory is gone.
- `packages/brain-cli/src/entries/*.ts` are the public API source files for generated `@rizom/brain` subpaths.
- the build emits declarations from those real source files.
- generated/published declarations contain no `@brains/*` imports.
- the package-local external plugin fixture typechecks against the generated/published plugin contract surface only.

Current pass: published declarations are generated and clean of internal `@brains/*` imports. Several surfaces are intentionally narrowed to contract exports while declaration bundling is proven. `ServicePlugin`, `EntityPlugin`, `InterfacePlugin`, and `MessageInterfacePlugin` are exposed through real public wrappers with generated declarations. `MessageInterfacePlugin` is exposed as optional sugar over `InterfacePlugin`, not as a replacement for non-chat interfaces.

If generation exposes leaks or unusable types, shrink the entry export surface. Do not replace generated declarations with handwritten interfaces, casts, broad `unknown` placeholders, or copied `.d.ts` blocks.

## Path forward

The iterative shape:

1. **Delete manual stubs for generated subpaths and wire declaration generation together.** Remove source `.d.ts` stubs for each migrated subpath and replace the copy step with generated declarations from `packages/brain-cli/src/entries/*.ts`. These land together; the published package must always have types. The site surface now follows the same pattern through a curated entry that keeps plugin instances and route internals opaque.

2. **Expose less first.** When generation reveals internal leakage (imports of `@brains/*`, transitive type graphs), the answer is to **shrink what `entries/*.ts` re-exports**, not to patch the generated output. For the first clean pass, prefer contracts-only exports over wholesale `@brains/plugins` re-exports.

3. **Add back iteratively after generation is clean.** One namespace or DTO at a time. Each addition: contract schema in `contracts/`, translator if internal shape differs, exposure via the right entry. Generated declarations prove the addition is clean. If something can't go through cleanly, the answer is contract redesign, not stub patching.

4. **Wrapper baseline complete.** `MessageInterfacePlugin` is public API for chat/channel integrations, documented as optional sugar over `InterfacePlugin`. The generated public surface is intentionally minimal: constructor, stable lifecycle hooks, channel-send abstract method(s), and progress/tracking helpers already proven by the fixture. File-upload formatting, URL extraction, size/type checks, and URL-capture helper implementation details stay `@internal` until their exact behavior is deliberately stabilized. Keep future additions contract-backed and prove them with the external fixture before expanding any additional namespaces.

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
- **Next context surface.** Daemon registration, tool registration, route registration, or another. Add only when a concrete external plugin need justifies expanding the contract.

## Acceptance criteria

- Public subpaths no longer have source type stubs; declarations are generated from curated public entries.
- Generated/published declarations contain no `@brains/*` import paths.
- The external plugin fixture (`packages/brain-cli/test/fixtures/external-plugin/`) typechecks against the published surface only.
- A CI check fails if generated declarations diverge from source-of-truth (or, equivalently, generation is part of the build and there are no committed declarations to drift against).
- Adding a field to a public DTO requires editing exactly the schema file; published declarations regenerate.
