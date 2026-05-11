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

## Current implementation status

Done:

- Renamed the entity count card to remove hero terminology:
  - `HeroCard` -> `EntitySummaryCard`
  - `render/hero.tsx` -> `render/entity-summary-card.tsx`
  - `.card--hero` -> `.card--entity-summary`
  - `.hero-number` / `.hero-label` -> `.entity-summary-number` / `.entity-summary-label`
- Switched dashboard widget visibility to the central `public` / `trusted` / `anchor` permission model.
- Added first-class interaction registration through `context.interactions.register(...)`.
- Added `appInfo.interactions` alongside `appInfo.endpoints`.
- Added permission visibility to endpoints and interactions.
- Rendered interactions in the dashboard as “Ways to connect”.
- Filtered widgets, endpoints, and interactions with the same permission model.
- Seeded initial interactions:
  - Site: public human interaction
  - A2A: public agent interaction
  - MCP: trusted protocol interaction
  - CMS: anchor admin interaction
  - Preview: anchor admin interaction
- Reworked layout so mobile can put identity/interactions before the entity summary while desktop keeps the sidebar model.

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

The interaction registry/API now exists. Endpoints are HTTP surfaces; interactions are user-facing ways to connect with the brain.

Current shape:

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

Initial seeded examples:

- Public site: `human`, `public`
- A2A endpoint: `agent`, `public`
- MCP endpoint: `protocol`, `trusted`
- CMS: `admin`, `anchor`
- Preview site: `admin`, `anchor`

Potential follow-up: register the dashboard itself as a public human interaction if it proves useful outside the dashboard page.

## Implementation phases

### Phase 1: Naming and layout cleanup — done

- Rename `HeroCard` to `EntitySummaryCard`.
- Rename related CSS classes.
- Keep visual output unchanged.
- Add/adjust tests only if snapshots or string expectations require it.

### Phase 2: Mobile ordering — done

- Keep desktop layout mostly unchanged.
- Render identity/sidebar content earlier on mobile.
- Avoid duplicating content in the DOM if possible; prefer CSS grid/order if accessible, otherwise split layout components carefully.
- Validate keyboard/read order, not just visual order.

### Phase 3: Identity card improvements — next

- Make role, purpose, and values easier to scan.
- Add room for primary interaction CTAs.
- Keep the card concise; avoid turning it into a full profile page.

### Phase 4: Interaction registry — done

- Add dashboard interaction types/schema using central permission levels.
- Add registration surface via plugin context or dashboard messaging.
- Filter interactions with `PermissionService.hasPermission`, same as widgets.
- Seed interactions from known app endpoints where reasonable, but do not rely on endpoints as the long-term source of truth.

### Phase 5: Render interactions — partially done

- Show top 3-5 interactions near/inside identity area.
- Show a fuller interaction/endpoint card lower in the sidebar or mobile flow.
- Visually distinguish human, agent, admin, and protocol interactions without adding icon complexity yet.

### Phase 6: Permission-aware entry point — partially done

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

Additional checks used on the current branch:

- `bun run --filter @brains/plugins typecheck`
- `bun run --filter @brains/plugins lint`
- `bun run --filter @brains/dashboard typecheck`
- `bun run --filter @brains/dashboard lint`
- `bun run --filter @brains/core typecheck`
- `bun run --filter @brains/webserver typecheck`
- `bun run --filter @brains/mcp typecheck`
- `bun run --filter @brains/a2a typecheck`
- targeted dashboard/plugin/A2A tests
