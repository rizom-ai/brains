# Plan: Organization site — the agent atlas

Last updated: 2026-09-26

## Status

In progress on `work/organization-atlas`: slice 1 is implemented and not yet merged. Five slices, each shippable on its own; the first is a pure extraction, the second is the walking skeleton.

## Goal

`@brains/site-organization`: a reusable site for team and organization brains. Its homepage is the professional site's atlas with the agent map in place of the knowledge map. The organization sits at the centre; the agents it has approved sit around it at their semantic distance and bearing, as on the console's proximity map; clusters of related agents rise as named territories; the authored opening, Ask box and contact door float over it, as on the professional atlas. The `team` recipe and the canonical team test app use it.

## Baseline

- **Professional atlas.** `@brains/site-professional` renders the atlas homepage when `homepageOpening` is on, `ask-content` is public and the contact plugin serves `/contact`. `datasources/homepage-atlas.ts` places published posts, decks and projects from `buildKnowledgeMapData` (`@brains/topics`), refit into the unit square, under topic territories. The renderer (`templates/homepage-atlas.tsx`, `homepage-atlas-styles.ts`, `homepage-atlas-script.ts`, `lib/atlas-terrain.ts`, `lib/atlas-labels.ts`) needs only `{ zones, items }` in unit coordinates. Two parts are bound to published work: `schemas/homepage-atlas.ts` fixes item types to `post | deck | project`, and the styles key glyph shapes on those types. The script keys marks by `type:entityId`, the key Ask answers use for their sources.
- **Agent map.** `buildProximityMapData` (`entities/agent-discovery/src/lib/proximity-map-data.ts`) returns first-order agents (approved, discovered, archived) with a cosine distance and bearing from the brain's `brain-character`, clusters of non-archived agents (connected within 0.25, two or more members, labelled `"<most common skill tag> · <count>"`), and second-order sightings. It is not exported. The console widget places a node at a radius proportional to `distance / max(distanceRange.max, farthest agent, 0.1)` (`polar` in `widgets/proximity-map.tsx`).
- **Agent pages.** The `agent-list` and `agent-detail` templates give `/agents` and `/agents/<slug>` for public agents. Site-builder enrichment adds `url` to any object carrying `entityType` and `metadata.slug`.
- **Team posture.** The `team` recipe (`packages/brain-cli/src/lib/brain-recipes.ts`) and `test-apps/team` use `@brains/site-default`, which re-exports the professional site; its plugin depends on `blog` and `decks`, which the team posture does not load. The published CLI resolves site packages only through `registerPackage` in `packages/brain-cli/scripts/entrypoint.ts`, where `@brains/site-default` is the only site. `contact` is in no bundle; brains add it.
- **Profiles.** `@brains/profile` exports `teamProfileFields` (purpose, focus areas, capabilities, working principles) and `organizationProfileFields` (mission, focus areas, offerings, values).
- **Fixtures.** The team seed content has one approved agent (`partner-brain.io`) and one discovered agent (`old-agent.io`); team eval cases reference both. No recipe has an `ask-content` fixture.

## Decisions

1. **Shared kit.** A new private package, `@brains/site-atlas` (`shared/site-atlas`), holds everything both sites render: the atlas hero (opening, Ask box host, door, map), terrain, label layout, styles, runtime script, the opening loader, the Ask-box availability check, the atlas data contract, and the header/footer layout as `SiteLayout`. Each site keeps its own map loader. The layout cannot live in `@brains/ui-library`, because `@brains/site-engine` depends on it, and sites do not import each other. `ProfessionalLayout` is removed; the professional site is its only consumer.
2. **Contract.** An item's `entityType` is any string. Each item carries a `glyph` (`dot`, `diamond` or `square`) and an optional `kindLabel`; styles key shapes on the glyph, and the legend lists each glyph with its `kindLabel`, falling back to the enriched `typeLabel`. The atlas gains an optional `centre` (a name and an optional link). The opening's `contactUrl` becomes nullable; without it, the topics and the contact door are omitted. The professional site maps post, deck and project to dot, diamond and square without `kindLabel`, and still requires a contact URL for its opening, so its page does not change.
3. **Who is on the map.** Approved first-order agents only, as linked marks. Discovered agents, archived agents and second-order sightings stay off the public homepage; the console map keeps showing them.
4. **Placement.** The `polar` placement moves to `@brains/agent-discovery/proximity-map` as a pure unit-scale helper that both the console widget and the atlas loader use, with the same maximum-distance rule. The organization is the centre at (0.5, 0.5), and the loader does not refit. Every agent's direction and relative distance match the console map. The map box's aspect stretches the rings into ellipses, as it stretches the knowledge terrain.
5. **Territories.** Each cluster with two or more approved members becomes a zone at their mean position, holding the approved member count; those members carry its `zoneId`. The zone is named by the most common skill tag among its approved members. That rule is split out of `deriveClusterLabel` and exported, so the console label and the territory name share it; the console keeps its `· <count>` suffix. A cluster whose approved members carry no tags becomes no zone.
6. **Kinds.** Person: dot, "Person". Team: diamond, "Team". Organization: square, "Organization".
7. **Opening.** Authored `ask-content`, when public, through the shared loader. Otherwise the anchor profile supplies it: the title from `tagline`, the introduction from `intro`, else `description`; the byline names the anchor. The organization site has no opt-in flag, because the atlas is its only homepage.
8. **Routes.** `/` (the atlas), `/about` (the anchor profile) and the generated `/agents` pages, with `agent` in the primary navigation. The site plugin depends on `agent-discovery` only.
9. **Distribution.** `@rizom/brain` registers `@brains/site-organization`, and the `team` recipe and `test-apps/team` select it. Existing brains keep the `site.package` they set. Organization-anchored brains select the site in `brain.yaml`.

## Slices

Each slice writes its tests first; passes `bun run typecheck`, `bun test` and `bun scripts/lint.mjs --force --filter <package>` (from the root) for every package it touches; and adds changesets for the published packages it changes.

### 1. Shared atlas kit

The professional site renders from `@brains/site-atlas`; nothing a visitor sees changes.

- Tests first: in `sites/professional`, a render test pins the homepage HTML for a fixed atlas-and-opening fixture before any code moves.
- Build: create `shared/site-atlas` and move into it `templates/homepage-atlas.tsx`, `homepage-atlas-styles.ts`, `homepage-atlas-script.ts`, `lib/atlas-terrain.ts`, `lib/atlas-labels.ts`, `schemas/homepage-atlas.ts`, `schemas/homepage-opening.ts`, `datasources/homepage-opening.ts`, `datasources/homepage-chat.ts`, and `layouts/ProfessionalLayout.tsx` as `SiteLayout`. The `atlas-labels`, `atlas-script`, `atlas-terrain` and `homepage-chat` tests move unchanged. The `homepage-atlas` and `homepage-opening` tests split: their rendering, style and opening-loader cases move to the kit and render `HomepageAtlas` directly; the knowledge-loader cases and the professional homepage's opt-in and hero cases stay. The professional site keeps its knowledge loader, homepage list, about page and subscribe pages, and imports the rest from the kit.
- Done when the moved tests pass in the kit and the pinned professional HTML is identical.

### 2. Walking skeleton: approved agents around the organization

A team brain's homepage shows its approved agents around the organization, each linking to its agent page, under an opening taken from the anchor profile.

- Tests first:
  - `agent-discovery`: the unit placement helper for known distance and bearing pairs and the maximum-distance rule; the widget's existing position tests pass on the helper.
  - Kit: glyph classes and the legend follow `glyph` and `kindLabel`; a `centre` renders as the centre mark; the pinned professional HTML changes only in glyph class names.
  - Organization loader: only approved agents appear; an agent without a public entity is absent; positions equal the helper's output; no projection, or no approved agent, yields no map while the opening still renders; without `ask-content`, the opening comes from the anchor profile.
  - Organization template: marks link to `/agents/<slug>` after enrichment and carry their kind's glyph; the legend names the kinds present.
  - `brain-cli`: the `team` recipe selects `@brains/site-organization`, and the entrypoint registers it.
- Build: the contract changes in decision 2; export `buildProximityMapData`, its context type and the placement helper from `@brains/agent-discovery/proximity-map`; create `sites/organization` with `SiteLayout`, the `/` route and a plugin with its homepage datasource and template; register the package in the CLI entrypoint and dependencies; switch the `team` recipe and `test-apps/team/brain.yaml`.
- Fixtures: add approved agents to `packages/brain-cli/eval-content/recipes/team/agent/` (people, a team and organizations) whose skill tags form two clusters. `partner-brain.io` and `old-agent.io` stay as they are.
- Verify on the running app: `bun start:team` from `packages/brain-cli`, trigger a preview rebuild on it through MCP HTTP (`--remote`), then check `dist/site-preview`: a mark for every approved fixture, none for `old-agent.io`, and each mark links to an agent page that exists. Check desktop and phone widths in both themes.
- Rerun the team eval cases that touch agents: `agent-approve`, `a2a-approved-peer-call`, `public-peer-call-denied`, `swot-agent-network` and `topic-relay-batch`.

### 3. Territories

Clusters of related agents rise as named territories.

- Tests first: a cluster of three approved agents becomes one zone at their mean position with three members, each carrying its `zoneId`, named by their most common tag; a cluster left with one approved member becomes no zone, and that agent sits outside every territory; a cluster whose approved members carry no tags becomes no zone; the console's cluster labels are unchanged; the terrain for the fixture is deterministic.
- Build: the shared top-tag rule in `agent-discovery`; clusters to zones in the organization loader.
- Verify: a preview rebuild on `bun start:team` shows the fixtures' two territories, named and clear of marks at desktop and phone widths.

### 4. Conversation: authored opening, door and Ask

The authored opening replaces the profile fallback; topics and the contact door appear when the brain serves `/contact`; the Ask box docks when Web Chat serves it.

- Tests first: public `ask-content` supplies the title, introduction and topics; without the contact route there are no topic links and no door; with Ask-box availability recorded, the host and box script render; an `ask:sources` event naming `agent:<id>` lights that agent's mark.
- Build: the shared opening loader returns the authored content with a nullable contact URL; the organization datasource uses it together with the Ask-box availability check.
- Fixtures: an `ask-content` entity in the team seed content; `contact` added to the `add` list in `test-apps/team/brain.yaml`.
- Verify: a preview rebuild shows the authored opening and a working door to `/contact`; with the local-test Ask preset, the box docks. No paid guest messages are sent; the script test covers source lighting.

### 5. About page

`/about` presents the team or organization from its anchor profile, and the centre mark links to it.

- Tests first: team fields render as purpose, focus areas, capabilities and working principles; organization fields render as mission, focus areas, offerings and values; absent fields leave no empty headings; the centre links to `/about`.
- Build: an about view schema combining the common profile fields with `teamProfileFields` and `organizationProfileFields`, all optional; the about template and route.
- Fixtures: purpose and focus areas in the team fixture's anchor profile; rerun the team eval cases that read the anchor profile.
- Verify: a preview rebuild shows `/about` from the team fixture's profile.

## Not in this plan

- rizom.ai's homepage keeps its branded narrative with the radial map hero; moving it onto this site is a separate change after slice 5.
- There is no `organization` brain recipe; organization-anchored brains select the site in `brain.yaml`.

## Related plans

- [public-ask.md](./public-ask.md): the Ask box contract and the professional atlas this site shares.
- [team-posture-capabilities.md](./team-posture-capabilities.md): the collective posture this site serves.
