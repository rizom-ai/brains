# Plan: Dashboard as Brain Entry Point

## Goal

Evolve the dashboard from a primarily report-like operator console into a polished entry point for the brain, while preserving the existing operator-console aesthetic and widget extension model.

The dashboard should answer:

- What is this brain?
- How can I interact with it?
- What is its current corpus shape?
- What extra context/actions become available when I am trusted or anchor?

## Decisions so far

- Keep the existing visual language: dark operator-console, cards, mono labels, strong identity.
- Keep the masthead mostly as-is.
- Keep the entity summary card, but stop treating it as the page hero.
- Keep identity content in the sidebar on desktop.
- Treat mobile as first-class, with a deliberate content order rather than a collapsed desktop layout.
- Public view should be meaningful.
- Trusted/anchor views should build on the same page rather than becoming a separate admin UI.
- Use the shared `public` / `trusted` / `anchor` permission model for dashboard visibility.
- Preserve widgets as the dashboard card/content extension system.
- Add a first-class concept for “ways to interact/connect” with the brain.

## Current cleanup

Rename the entity count card to remove hero terminology:

- `HeroCard` -> `EntitySummaryCard`
- `render/hero.tsx` -> `render/entity-summary-card.tsx`
- `.card--hero` -> `.card--entity-summary`
- `.hero-number` / `.hero-label` -> `.entity-summary-number` / `.entity-summary-label`

This is a low-risk naming cleanup before larger UX work.

## Proposed UX structure

### Desktop

1. Masthead
2. Main column
   - Entity summary
   - Restricted sign-in gate when relevant
   - Primary widgets
   - Secondary widgets
3. Sidebar
   - Identity card
   - Top interaction links / calls to action
   - Sidebar widgets
   - Full endpoint/interaction card
4. Colophon

### Mobile

Use a different order optimized for entry:

1. Masthead
2. Identity card
3. Top interaction links / calls to action
4. Entity summary
5. Restricted sign-in gate when relevant
6. Primary widgets
7. Secondary widgets
8. Endpoint/interaction details
9. Colophon

Rationale: a phone visitor is more likely trying to understand and interact with the brain than inspect corpus metrics first.

## Interaction model

Add a small interaction registry/API over time. Endpoints are HTTP surfaces; interactions are user-facing ways to connect with the brain.

Suggested shape:

```ts
interface DashboardInteraction {
  id: string;
  label: string;
  description?: string;
  href: string;
  kind: "human" | "agent" | "admin" | "protocol";
  visibility: "public" | "trusted" | "anchor";
  priority?: number;
  status?: "available" | "coming-soon" | "disabled";
}
```

Initial likely examples:

- Public site: `human`, `public`
- A2A endpoint: `agent`, `public`
- CMS: `admin`, probably `anchor` unless configured otherwise
- MCP endpoint: `protocol`, `trusted` or `anchor`
- Dashboard itself: `human`, `public`

## Implementation phases

### Phase 1: Naming and layout cleanup

- Rename `HeroCard` to `EntitySummaryCard`.
- Rename related CSS classes.
- Keep visual output unchanged.
- Add/adjust tests only if snapshots or string expectations require it.

### Phase 2: Mobile ordering

- Keep desktop layout mostly unchanged.
- Render identity/sidebar content earlier on mobile.
- Avoid duplicating content in the DOM if possible; prefer CSS grid/order if accessible, otherwise split layout components carefully.
- Validate keyboard/read order, not just visual order.

### Phase 3: Identity card improvements

- Make role, purpose, and values easier to scan.
- Add room for primary interaction CTAs.
- Keep the card concise; avoid turning it into a full profile page.

### Phase 4: Interaction registry

- Add dashboard interaction types/schema using central permission levels.
- Add registration surface via plugin context or dashboard messaging.
- Filter interactions with `PermissionService.hasPermission`, same as widgets.
- Seed interactions from known app endpoints where reasonable, but do not rely on endpoints as the long-term source of truth.

### Phase 5: Render interactions

- Show top 3-5 interactions near/inside identity area.
- Show a fuller interaction/endpoint card lower in the sidebar or mobile flow.
- Visually distinguish human, agent, admin, and protocol interactions without adding icon complexity yet.

### Phase 6: Permission-aware entry point

- Public: identity, entity summary, public interactions, public widgets.
- Trusted: public plus trusted protocol/agent surfaces like MCP where appropriate.
- Anchor: public/trusted plus private/admin interactions and widgets.
- Do not show explicit permission badges on every widget.

## Non-goals

- Do not replace the widget system.
- Do not turn the dashboard into a dense operations report.
- Do not prioritize content health or daemon/job health as the main dashboard story.
- Do not create a separate anchor-only dashboard page.
- Do not add widget visibility badges.

## Validation

For code changes:

- `cd plugins/dashboard && bun run typecheck`
- `cd plugins/dashboard && bun run lint`
- targeted dashboard tests
- if interaction contracts touch shared plugin APIs: `cd shell/plugins && bun run typecheck && bun run lint`

Note: this worktree may need dependencies installed or linked before local typecheck can run.
