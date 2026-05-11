# Plan: Template Renderer Contracts

## Status

Proposed. The natural follow-up to the site-builder boundary cleanup if we want renderer flexibility beyond the current Preact static builder.

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

## Astro renderer spike

Astro is the first concrete proof point for this contract work. The spike should stay behind the existing static builder contract/factory shape and should not move plugin orchestration out of `plugins/site-builder`.

Questions to answer:

1. Can Astro render one static route and one entity detail route from the existing route/content contracts?
2. Can existing Preact layouts/templates be reused as Astro islands, or would they need migration?
3. Can Astro consume entity content directly through a loader/integration, or does it require generated files?
4. Does the current theme/CSS-variable pipeline work under Astro without visual regressions?
5. Can build progress and failures be surfaced through the existing site-build job flow?

Spike validation:

- Build with the current Preact builder to confirm no regression.
- Experimental Astro output preserves site metadata, layout metadata, navigation, and CTA behavior for tested routes.
- Runtime smoke still uses the current Preact builder unless/until Astro is explicitly selected.

The spike succeeds if Astro can render representative routes with the neutral contracts and without plugin orchestration changes. Abandon it if it requires broad contract churn, breaks site package compatibility, or cannot preserve current rendering behavior without significant migration work.
