# Plan: Astro Renderer Spike

## Status

Site-builder decoupling is complete. The remaining open question is whether an Astro-based renderer should replace or complement the current Preact static builder.

## Goal

Evaluate Astro as an optional renderer behind the existing static site-builder contract without changing plugin orchestration.

## Non-goals

- Do not remove the current Preact builder during the spike.
- Do not change site metadata/provider behavior.
- Do not change route/content contracts unless the spike proves a concrete need.
- Do not move plugin orchestration into shared packages.

## Current baseline

- `plugins/site-builder` owns orchestration: plugin registration, tools, resources, job handlers, message handlers, rebuild events, and SEO post-build handling.
- `@brains/site-composition` owns data contracts: metadata, layout data, routes, navigation, site package shape, and route message payloads.
- `@brains/site-engine` owns renderer/build utilities and renderer-facing contracts.
- The current Preact builder remains the production renderer.

## Spike questions

1. Can Astro render one static route and one entity detail route from the existing route/content contracts?
2. Can existing Preact layouts/templates be reused as Astro islands, or would they need migration?
3. Can Astro consume entity content directly through a loader/integration, or does it require generated files?
4. Does the current theme/CSS-variable pipeline work under Astro without visual regressions?
5. Can build progress and failures be surfaced through the existing site-build job flow?

## Proposed approach

1. Add an experimental Astro builder implementation in `@brains/site-engine` or a separate experimental package.
2. Keep it behind the existing static builder contract/factory shape.
3. Render a minimal route set:
   - home page/static route
   - one entity list or detail route
4. Compare generated output against the current Preact builder.
5. If viable, decide whether to continue toward a full adapter.

## Validation

- Targeted typecheck/lint for changed packages.
- Build with the current Preact builder to confirm no regression.
- Experimental Astro output must preserve site metadata, layout metadata, navigation, and CTA behavior for tested routes.
- Runtime smoke should still use the current Preact builder unless/until Astro is explicitly selected.

## Exit criteria

The spike is successful if it proves Astro can render representative routes with existing contracts and without plugin orchestration changes.

The spike should be abandoned if it requires broad contract churn, breaks site package compatibility, or cannot preserve current rendering behavior without significant migration work.
