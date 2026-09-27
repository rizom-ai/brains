# Plan: Organization site — the agent radar

Last updated: 2026-09-26

## Status

In progress on `work/organization-atlas`: slices 1 to 3 are committed and not yet merged; slice 4 is built. Five slices, each shippable on its own; the first is a pure extraction, the second is the walking skeleton.

## Goal

`@brains/site-organization`: a reusable site for team and organization brains. Its homepage has the professional site's look and feel, the authored opening, Ask box and contact door floating over a full-screen map, with an agent radar in place of the landscape, drawn in the atlas's own hand as the approved mockup [`docs/design/organization-homepage-mockup.html`](../design/organization-homepage-mockup.html) shows: the team at the centre of a quiet scope, its agents placed by how close their work runs to the team's, constellations as named echoes, and a pulse radiating outwards. The `team` recipe and the canonical team test app use it.

## Baseline

- **Professional atlas.** `@brains/site-professional` renders the atlas homepage when `homepageOpening` is on, `ask-content` is public and the contact plugin serves `/contact`. `datasources/homepage-atlas.ts` places published posts, decks and projects from `buildKnowledgeMapData` (`@brains/topics`), refit into the unit square, under topic territories. The renderer (`templates/homepage-atlas.tsx`, `homepage-atlas-styles.ts`, `homepage-atlas-script.ts`, `lib/atlas-terrain.ts`, `lib/atlas-labels.ts`) needs only `{ zones, items }` in unit coordinates. Two parts are bound to published work: `schemas/homepage-atlas.ts` fixes item types to `post | deck | project`, and the styles key glyph shapes on those types. The script keys marks by `type:entityId`, the key Ask answers use for their sources.
- **Agent radar.** `buildProximityMapData` (`entities/agent-discovery/src/lib/proximity-map-data.ts`) returns first-order agents (approved, discovered, archived) with a cosine distance and bearing from the brain's `brain-character`, constellations of connected agents, and second-order sightings. `ProximityMap` draws it on a `site` surface, styled by `proximityMapSiteStyles` and driven by `proximityMapScript` (all from the pure `@brains/agent-discovery/proximity-map` subpath); rizom.ai's homepage embeds it by wrapping the component in an `agent-proximity-site` element.
- **Agent pages.** The `agent-list` and `agent-detail` templates give `/agents` and `/agents/<slug>` for public agents. Site-builder enrichment adds `url` to any object carrying `entityType` and `metadata.slug`.
- **Team posture.** The `team` recipe (`packages/brain-cli/src/lib/brain-recipes.ts`) and `test-apps/team` use `@brains/site-default`, which re-exports the professional site; its plugin depends on `blog` and `decks`, which the team posture does not load. The published CLI resolves site packages only through `registerPackage` in `packages/brain-cli/scripts/entrypoint.ts`, where `@brains/site-default` is the only site. `contact` is in no bundle; brains add it.
- **Profiles.** `@brains/profile` exports `teamProfileFields` (purpose, focus areas, capabilities, working principles) and `organizationProfileFields` (mission, focus areas, offerings, values).
- **Fixtures.** The team seed content has one approved agent (`partner-brain.io`) and one discovered agent (`old-agent.io`); team eval cases reference both. No recipe has an `ask-content` fixture.

## Decisions

1. **Shared kit.** A new private package, `@brains/site-atlas` (`shared/site-atlas`), holds everything both sites render: the atlas frame (opening, Ask box host, door, map box), the terrain map with its label layout, styles and runtime script, the opening loader, the Ask-box availability check, the terrain contract, and the header/footer layout as `SiteLayout`. The layout cannot live in `@brains/ui-library`, because `@brains/site-engine` depends on it, and sites do not import each other. `ProfessionalLayout` is removed; the professional site is its only consumer.
2. **Frame contract.** `HomepageAtlas` draws either the terrain from atlas data (the professional site) or a map element the site supplies, with that map's accessible name (the organization site). The opening's `contactUrl` is nullable; without it, the topics and the contact door are omitted. The terrain contract stays as the professional site uses it; the glyph, kind-label and centre additions slice 2 made for an agent terrain are removed, because the radar draws agents itself.
3. **The radar.** The organization homepage draws its agents in the atlas's own hand, as the mockup shows. A quiet scope: range rings for semantic distance and bearing ticks on its edge, around the team at the centre. Each agent is an atlas mark at the position the console's proximity map gives it, through placement helpers shared with the console widget on the pure `@brains/agent-discovery/proximity-map` subpath, and is named beside its mark; people are dots, teams diamonds, organizations squares, and agents awaiting review outlines. Approved and discovered first-order agents are shown; archived agents and second-order sightings stay on the console. Each constellation is an echo: stacked contour lines, traced by the kit's contour tracer, around its agents and pinched along the threads between them, named in the atlas's italic; a lone agent gets a small island. The one motion is a pulse radiating from the centre every nine seconds; each echo and mark lights as the wave reaches its distance, so the closest light first, and reduced motion stops it. The data comes from `buildProximityMapData` through the `@brains/agent-discovery/proximity-map-data` subpath, so the pure subpath rizom.ai bundles stays free of the entity runtime; the console widget and its styles are not used. Without a projection or any charted agent, the frame renders without a map.
4. **Constellations.** Each shown agent joins the shown agent nearest it within 0.35 cosine distance, which the loader asks of the projection: agent descriptions sit farther apart than the console's fixed 0.25 cut-off (the team seed's closest pairs are 0.28–0.29), and joining only the nearest keeps a chain of near pairs from running into one constellation. A group becomes a constellation when at least two members share a skill tag, named by the tag most of them share through `mostCommonTag`, which the console's cluster labels also use. The console's clusters keep their own rule.
5. **Opening.** Authored `ask-content`, when public, through the shared loader. Otherwise the anchor profile supplies it: the title from `tagline`, the introduction from `intro`, else `description`; the byline names the anchor. The organization site has no opt-in flag, because the radar is its only homepage.
6. **Routes.** `/` (the radar homepage), `/about` (the anchor profile) and the generated `/agents` pages, with `agent` in the primary navigation. The site plugin depends on `agent-discovery` only.
7. **Distribution.** `@rizom/brain` registers `@brains/site-organization`, and the `team` recipe and `test-apps/team` select it. Existing brains keep the `site.package` they set. Organization-anchored brains select the site in `brain.yaml`.

## Slices

Each slice writes its tests first; passes `bun run typecheck`, `bun test` and `bun scripts/lint.mjs --force --filter <package>` (from the root) for every package it touches; and adds changesets for the published packages it changes.

### 1. Shared atlas kit

The professional site renders from `@brains/site-atlas`; nothing a visitor sees changes.

- Tests first: in `sites/professional`, a render test pins the homepage HTML for a fixed atlas-and-opening fixture before any code moves.
- Build: create `shared/site-atlas` and move into it `templates/homepage-atlas.tsx`, `homepage-atlas-styles.ts`, `homepage-atlas-script.ts`, `lib/atlas-terrain.ts`, `lib/atlas-labels.ts`, `schemas/homepage-atlas.ts`, `schemas/homepage-opening.ts`, `datasources/homepage-opening.ts`, `datasources/homepage-chat.ts`, and `layouts/ProfessionalLayout.tsx` as `SiteLayout`. The `atlas-labels`, `atlas-script`, `atlas-terrain` and `homepage-chat` tests move unchanged. The `homepage-atlas` and `homepage-opening` tests split: their rendering, style and opening-loader cases move to the kit and render `HomepageAtlas` directly; the knowledge-loader cases and the professional homepage's opt-in and hero cases stay. The professional site keeps its knowledge loader, homepage list, about page and subscribe pages, and imports the rest from the kit.
- Done when the moved tests pass in the kit and the pinned professional HTML is identical.

### 2. Walking skeleton: the organization homepage

A team brain's homepage opens on its agent map under an opening taken from the anchor profile. (Committed with an agent terrain; slice 3 replaces that map with the radar.)

- Build: `sites/organization` with `SiteLayout`, the `/` route and a plugin with its homepage datasource and template; the opening from the anchor profile; the package registered in the CLI entrypoint and dependencies; the `team` recipe, `test-apps/team/brain.yaml` and the canonical-team fixture switched to it.
- Fixtures: approved agents in `packages/brain-cli/eval-content/recipes/team/agent/` (people, a team and organizations) in two themes. `partner-brain.io` and `old-agent.io` stay as they are.
- Verify on the running app: `bun start:team` from `packages/brain-cli` builds the preview itself after the seed import; later rebuilds go through MCP HTTP, whose default basic mode offers only `chat` and `confirm`. Check `dist/site-preview`, served at `http://preview.localhost:8080`, at desktop and phone widths in both themes.
- Rerun the team eval cases that read the seeded agents: `agent-approve`, `a2a-approved-peer-call`, `public-peer-call-denied`, `topic-relay-batch`, `new-teammate-onboarding` and `team-memory-overview-list`. (`swot-agent-network` brings its own agent network and is not part of the team suite.)

### 3. The radar

The organization homepage draws the approved mockup: the scope, named agents, constellation echoes and the pulse, inside the atlas frame.

- Tests first:
  - `agent-discovery`: the placement helpers (reach, point on a disc, maximum distance) and the widget drawing byte-identically on them; `mostCommonTag`, with the console's cluster labels unchanged.
  - Kit: a site-supplied map renders in the map box under its own name, with no terrain; without a contact URL there is no door; the contour tracer draws the terrain byte-identically, so the pinned professional HTML is identical to slice 1's.
  - Organization loader: approved and discovered first-order agents at the helpers' positions, archived agents and sightings absent, agents the build cannot see absent; constellations by nearest neighbour within 0.35, named by a shared tag, none where no tag is shared; the pulse delay grows with distance; no map without a projection or a charted agent.
  - Organization homepage: the scope, echoes, named marks linking to `/agents/<slug>`, constellation names, the centre and the legend render in the frame; the template ships only the atlas script.
- Build: the placement helpers and `mostCommonTag` in `agent-discovery`; the kit's contour tracer; the organization radar model, loader and component with their styles; the console-widget embedding removed.
- Verify: a preview rebuild on `bun start:team` matches the mockup with the team fixtures, at desktop and phone widths in both themes.

### 4. Conversation: authored opening, door and Ask

The authored opening replaces the profile fallback; topics and the contact door appear when the brain serves `/contact`; the Ask box docks when Web Chat serves it.

- Tests first: public `ask-content` supplies the opening, and without it the profile's stands; the shared loader keeps the authored words without a door where no contact form is reachable, while the professional homepage keeps its list page without a door; with a contact URL the topics and door render, and with Ask-box availability recorded the host and box script render; an authored map caption names the radar and its legend.
- Build: the shared opening loader returns the authored content with a nullable contact URL; the organization datasource uses it together with the Ask-box availability check.
- Fixtures: an `ask-content` entity in the team seed content. The contact intake stays out of the canonical team app: it is unreleased and default-off with every policy explicit, so the door and box are verified with a local, uncommitted intake and the Web Chat `local-test` preset.
- Verify: a preview rebuild shows the authored opening, a working door to `/contact` and the docked box. No paid guest messages are sent.

### 5. About page

`/about` presents the team or organization from its anchor profile.

- Tests first: team fields render as purpose, focus areas, capabilities and working principles; organization fields render as mission, focus areas, offerings and values; absent fields leave no empty headings.
- Build: an about view schema combining the common profile fields with `teamProfileFields` and `organizationProfileFields`, all optional; the about template and route.
- Fixtures: purpose and focus areas in the team fixture's anchor profile; rerun the team eval cases that read the anchor profile.
- Verify: a preview rebuild shows `/about` from the team fixture's profile.

## Not in this plan

- rizom.ai's homepage keeps its branded narrative with the radar hero; moving it onto this site is a separate change after slice 5.
- The radar does not light an Ask answer's sources; source lighting stays with the terrain's marks.
- There is no `organization` brain recipe; organization-anchored brains select the site in `brain.yaml`.

## Related plans

- [public-ask.md](./public-ask.md): the Ask box contract and the professional atlas this site shares.
- [team-posture-capabilities.md](./team-posture-capabilities.md): the collective posture this site serves.
