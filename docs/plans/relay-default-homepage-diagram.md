# Plan: Relay Default Homepage — System Diagram

## Status

Implemented. Direction C from the mock is now the Relay default homepage:
a single system-diagram section backed by live entity counts and editable
`site-content` copy.

## Mock

A static, self-contained mock with three explored directions lives at
[`brains/relay/test-apps/default/mocks/home.html`](../../brains/relay/test-apps/default/mocks/home.html).
Open it in a browser; the sticky compare bar jumps between A (Living
signals), B (Editorial brief), and C (System diagram). This plan implements
**direction C** only.

## Context

The previous Relay default homepage (`brains/relay/src/site.tsx`) shipped
three sections — hero, operating-loop, and surface-cards — that all explained
the same thing in different shapes. The result read like a marketing page
that wasn't backed by anything; the copy talked about capture/synthesize/share
but nothing on the page was _evidence_ of it.

Direction C reframes the homepage around an annotated system diagram:
capture sources flow into a central brain that fans out to public surfaces.
The diagram is the page. The numbers in the diagram (captures, topics,
summaries, peer brains) come from the live brain via a DataSource so the
homepage stays true on a sparse install and accurate on a populated one.

Directions A and B were rejected because they lean hard on content that
doesn't exist yet (live event stream / synthesized weekly feed) and would
gut on an empty brain — exactly the state a fresh install ships in.

## Goal

The Relay default homepage is a single section that explains the system
diagrammatically and shows real entity counts pulled from the brain at
build time. Empty brains render cleanly (zeros, not broken cards). The
existing Rizom theme (Fraunces / Barlow / JetBrains Mono, amber + purple
palette) is preserved.

## Non-goals

- Animating the diagram beyond the existing CSS-only ring rotation. No
  realtime updates, no JS-driven flow lines.
- Replacing the about page or any other route.
- Adding a generic "entity counts" query handler usable across the codebase.
  The DataSource here is Relay-homepage-specific; if a second consumer
  appears, generalize then.
- Removing the existing `RelayLoopSection` / `RelaySurfaceSection` components
  or their site-content schemas. They stop being used by the home route but
  stay defined so other test apps or future routes can mount them.

## Architectural decisions

### 1. One DataSource, returning a fixed shape

`RelayHomeCountsDataSource` lives in `brains/relay/src/`, calls
`context.entityService.countEntities()` for each relay-relevant entity type,
and returns:

```ts
{
  captures: number;
  links: number;
  topics: number;
  summaries: number;
  peers: number;
}
```

`captures` is the count of `base` entities (notes), `peers` is the count of
`agent` entities. Each `countEntities` call is wrapped so an unregistered
entity type (e.g. `agent` when `agent-discovery` isn't loaded) yields `0`
rather than throwing — the diagram must render on a default install that
doesn't enable every plugin.

Why a dedicated DataSource per template, not a shared one: the existing
codebase pattern (`rizom-ecosystem`, `summary`) ties one DataSource to one
template. Following the pattern beats inventing a parallel one.

### 2. Single section template with merged hero + diagram

The home route goes from `[hero, loop, surface]` to `[diagram]`. The diagram
section's schema covers both the hero copy and the diagram content:

```
eyebrow, headline, intro, primaryCta, secondaryCta,   // hero
inputs[]:  { label, title, detail }                   // left nodes
outputs[]: { label, title, detail }                   // right nodes
core:      { eyebrow, name, sub }                     // center
legend[]:  { tone: "capture"|"synthesis"|"share", title, text }
```

Counts are **not** in the schema — they come from the DataSource and are
merged into the layout props at resolution time, so seed-content markdown
doesn't need to fake them.

### 3. Counts merged at the DataSource layer, not the layout

The DataSource reads the section's static content (eyebrow, headline,
inputs, outputs, etc.) plus the live counts and returns the union. The
layout component receives a fully-populated props object. This keeps the
layout component a pure renderer and means the schema can validate the full
shape before render.

## Work

1. **DataSource** — implemented in
   `brains/relay/src/home-counts-datasource.ts`. It calls
   `entityService.countEntities()` per type with a per-type guard so missing
   or unregistered entity types yield `0`.

2. **Section template + layout** — implemented in `brains/relay/src/site.tsx`
   as `RelayDiagramSection` plus a manual `relay-site:home-diagram` template.
   The old hero/loop/surface components and schemas remain defined but are no
   longer mounted by `/`.

3. **Wire DataSource to template** — implemented via `dataSourceId:
"relay-site:home-counts"`. `@brains/site-rizom` now lets variant sites
   register DataSources alongside extra templates.

4. **Replace home route sections** — implemented: `relayRoutes` now mounts a
   single `diagram` section for `/`.

5. **Seed content** — implemented: `seed-content/site-content/home/diagram.md`
   and `eval-content/site-content/home/diagram.md` hold editable diagram copy.
   Counts are not stored in markdown.

6. **Verify** — verified locally with `bun start:default`; preview output
   renders the diagram and live counts from the current test-app entity set.

## Verification

- `bun run typecheck` in `brains/relay` passes.
- `bun run typecheck` in `sites/rizom` passes.
- Relay `src` ESLint passes.
- `sites/rizom` lint passes.
- Default test app boots and emits a preview build. Background AI jobs may
  fail with a dummy `AI_API_KEY`, but the homepage build succeeds.

## Risks / open questions

- **Entity type for "captures"**: currently `base` (notes). Links are counted
  separately and shown as "links indexed" in the center of the diagram. If
  Relay later treats links + notes as one capture number, update the DataSource.
- **Peer-brain count source**: currently `agent` from `@brains/agent-discovery`.
  If discovered peers move to an A2A registry, swap the source.
- **Empty-state copy**: at zero counts the diagram still shows "0 captures,
  0 topics" etc. This is intentional for fresh installs, but worth revisiting
  after the first demo.
