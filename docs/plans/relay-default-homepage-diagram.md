# Plan: Relay Default Homepage — System Diagram

## Status

Proposed. Visual direction picked (direction C from the mock); investigation
of the data-wiring path complete; not yet implemented.

## Mock

A static, self-contained mock with three explored directions lives at
[`brains/relay/test-apps/default/mocks/home.html`](../../brains/relay/test-apps/default/mocks/home.html).
Open it in a browser; the sticky compare bar jumps between A (Living
signals), B (Editorial brief), and C (System diagram). This plan implements
**direction C** only.

## Context

The current Relay default homepage (`brains/relay/src/site.tsx`) ships three
sections — hero, operating-loop, and surface-cards — that all explain the
same thing in different shapes. The result reads like a marketing page that
isn't backed by anything; the copy talks about capture/synthesize/share but
nothing on the page is _evidence_ of it.

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

1. **DataSource** — `brains/relay/src/home-counts-datasource.ts`. ~50 LOC.
   Calls `entityService.countEntities()` per type with a per-type `try/catch
→ 0` guard. Implements the `DataSource` interface; `id =
"relay-site:home-counts"`.

2. **Section template + layout** — extend `relaySiteContentDefinition.sections`
   in `brains/relay/src/site.tsx` with a `home-diagram` entry. New
   `RelayDiagramSection` component ports the C mock to Preact, using
   existing `Section` / `Button` from `@brains/site-rizom`. CSS-only ring
   animation stays inline (or moves to a small style block in the layout).

3. **Wire DataSource to template** — add `dataSourceId:
"relay-site:home-counts"` on the `home-diagram` template; register the
   DataSource through whatever path the relay site does it (mirror the
   `rizom-ecosystem` template registration).

4. **Replace home route sections** — `relayRoutes` home goes to a single
   `home-diagram` section. Hero/loop/surface schemas + components stay in
   the file, just unused by `/`.

5. **Seed content** — replace `seed-content/site-content/home/{hero,loop,
surface}.md` with one `home/diagram.md` matching the new schema (hero
   copy + inputs/outputs/core/legend). No counts in the markdown.

6. **Verify** — `bun run start:default` from `brains/relay`, confirm the
   homepage renders with zeroed counts on an empty brain, then seed a few
   entities and confirm the numbers move.

## Risks / open questions

- **Entity type for "captures"**: assumed to be `base` (notes). Confirm
  during implementation; if Relay considers links + notes as combined
  "captures", the DataSource sums both.
- **Peer-brain count source**: `@brains/agent-discovery`'s `agent` entity
  type is the assumption. If discovered peers live in a different store
  (e.g. an A2A registry), swap the source.
- **Empty-state copy**: at zero counts the diagram still shows "0 captures,
  0 topics" etc. Likely fine — it makes the install state legible — but
  worth a glance before merging.
