# Knowledge Map

**Status:** Phase 1 in progress

A centerless 2D semantic projection of the brain's entity corpus — "what this
brain knows, as a sky." Topics are territories: soft-bounded zones that hold
the entities semantically filed into them. Published work glows; skills are
moss; operational entities are ground spores; an entity outside every border
is visibly unfiled. Design settled in `docs/rizom-knowledge-map-mockup.html`
(and the home mock's proof section, rev 11).

Ships on two surfaces from one renderer, exactly like the agent proximity
map: a console dashboard widget and a site section template (the home page's
"It starts with you / This site is a brain" proof section).

## Owner

`entities/topics` — territories are the topics system's visible behavior.
The plugin already registers dashboard widgets and owns the `topic` entity
type. No new package.

## Foundations (verified)

- `semantic.project()` (shell/entity-service/src/semantic-space.ts) already
  produces a centerless 2D PCA projection: `points[].coordinates: [x, y]`,
  optional `types` filter (empty = all), `visibilityScope`, and pairwise
  `neighbors` under `maxNeighborDistance`. No new service surface needed.
- Topics are embedded (type weight 0.5) and enumerable like any entity.
- Widget pattern: `dashboard:register-widget` message with `component`,
  `dataProvider`, `clientStyles` (agent-discovery/src/lib/agent-dashboard.ts).
- Template pattern: `createTemplate({ schema, dataSourceId, overlayFormatter,
layout })` with the shared renderer at `surface="site"`.

## Shape of the data

`buildKnowledgeMapData(context)` → `KnowledgeMapData`:

- `points`: every projected entity — id, type, title, `[x, y]` normalized to
  a unit box, render kind derived from type:
  - `published` (post, deck) — glowing
  - `skill` — moss
  - `topic` — not a point; becomes a zone
  - everything else (prompt, site-content, site-info, anchor-profile, …) —
    `ground` spores; `note`-like types (swot, doc) — `pearl`
- `zones`: one per topic — name, the topic's own projected position, and
  `memberIds` = non-topic points whose nearest topic in the projected plane
  is this one, within radius `R` (2D distance, so zones visually contain
  their members by construction). Empty topics are small named clearings.
- `unfiled`: point ids outside every zone radius (published ones matter most).
- `counts`: entities, topics, embedded/total.

## Phases (thin vertical slices, tests first)

1. **Data builder** — `entities/topics/src/lib/knowledge-map-data.ts` +
   zod schema; unit tests with a stubbed semantic projection + entity lists.
2. **Renderer** — `KnowledgeMap({ data, surface })` preact SVG: blob zones
   (mist + dashed border + floating label `name · n`), kind-styled dots,
   spores, CSS draw-in choreography. Render tests via preact-render-to-string.
3. **Dashboard widget** — registration in the topics plugin (`group:
"knowledge"`, primary), dataProvider → builder, digestProvider counts.
4. **Site template** — `topics:knowledge-map` with overlay-authored proof
   copy (cap, headline, intro, CTAs, proof links) around the renderer;
   route swap: home `one-light` section → this template; alive-line folds in.
5. **Content + deploy** — author the proof copy in rizom-content, route/order
   test updates, release train, verify live.
