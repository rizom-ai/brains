# Plan: Template Renderer Contracts

## Status

Planned. This is the natural follow-up to the site-builder boundary cleanup if we want renderer flexibility beyond the current Preact static builder.

## Context

The site-builder refactor separated three responsibilities:

- `@brains/site-composition` owns site composition data contracts: routes, navigation, site metadata, layout metadata, and site package shape.
- `@brains/site-engine` owns build/render utilities and renderer-facing contracts.
- `plugins/site-builder` owns plugin orchestration: jobs, tools, messages, resources, rebuilds, and SEO post-build handling.

`@brains/templates` is now the next architecture hinge. It currently carries template definitions and rendering-related concepts that are useful to the Preact renderer, but future renderers such as Astro need a clearer renderer-neutral contract.

## Goal

Make `@brains/templates` the renderer-neutral content/view contract layer.

It should describe:

- what data a template needs
- how that data is fetched or generated
- what schema validates the data
- what render capabilities the template has
- what renderer-specific adapters are available, if any

It should not require site-builder plugin orchestration or assume a single rendering implementation.

## Proposed package roles

### `@brains/site-composition`

Owns site-level data contracts:

- site metadata provider channels and schemas
- site layout info
- route and section definitions
- navigation metadata
- site package shape and merge helpers

### `@brains/templates`

Owns template/view contracts:

- template identity and metadata
- input/output schemas
- datasource binding
- generation/fetch/render capability metadata
- renderer-neutral template descriptors
- optional renderer adapter references

### `@brains/site-engine`

Owns renderer/build implementation:

- static build contracts
- Preact builder and future renderer adapters
- CSS/head/HTML/image/route utilities
- code that adapts template descriptors to a concrete renderer

### `plugins/site-builder`

Owns orchestration only:

- selecting/building the static builder
- connecting plugin services to build contracts
- handling job queue, messages, resources, tools, rebuilds, and SEO events

## Desired direction

A future template contract should make renderer-specific details explicit instead of implicit. For example:

```ts
interface TemplateDescriptor<TData = unknown> {
  name: string;
  schema: unknown;
  dataSourceId?: string;
  permissions?: unknown;
  capabilities: {
    fetch?: boolean;
    generate?: boolean;
    render?: boolean;
  };
  renderers?: {
    preact?: unknown;
    astro?: unknown;
  };
}
```

This is illustrative only. The real shape should be derived from existing template use sites and should preserve backward compatibility.

## Steps

1. Audit current `@brains/templates` exports and all consumers.
2. Classify exports as:
   - renderer-neutral contracts
   - Preact-specific runtime/render helpers
   - plugin/runtime integration
   - legacy compatibility exports
3. Define a narrow renderer-neutral template descriptor.
4. Add compatibility adapters from existing template definitions to the new descriptor.
5. Update `@brains/site-engine` to depend on the narrow descriptor where possible.
6. Keep Preact-specific component contracts in renderer-facing packages, not in the neutral descriptor.
7. Add tests for descriptor compatibility and template capability detection.
8. Update docs once the contract is stable.

## Guardrails

- Preserve current site rendering behavior.
- Preserve existing template authoring APIs until there is a migration path.
- Do not move plugin orchestration into `@brains/templates`.
- Do not make shared packages depend on `@brains/plugins` internals.
- Avoid broad renames unless they remove real ambiguity.
- Avoid casts as boundary glue; fix contracts instead.

## Validation

- `bun run --filter @brains/templates typecheck`
- `bun run --filter @brains/templates lint`
- `bun run --filter @brains/templates test`
- `bun run --filter @brains/site-engine typecheck`
- `bun run --filter @brains/site-builder-plugin typecheck`
- Runtime smoke with the current Preact builder if renderer-facing behavior changes.

## Relationship to Astro

This plan should happen before or alongside the Astro spike in [`astro-renderer-spike.md`](./astro-renderer-spike.md).

The Astro spike answers whether Astro is viable as a renderer. This plan makes sure templates can be consumed by more than one renderer without leaking plugin orchestration or Preact assumptions into shared contracts.
