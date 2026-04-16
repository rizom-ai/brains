# Rizom Sites — Deferred TBDs

These items are **not blockers** for the current Rizom sites implementation.

Current technical status:

- all three Rizom apps now own their final route trees from app-local `src/site.ts`
- `rizom.foundation` and `rizom.work` now use tracked `site-content` for durable section copy
- all three Rizom apps are now wired to dedicated content repos
- the changed apps boot successfully after the composition/content split
- known broken anchor cleanup was already fixed (`rizom.work` closer CTA)

What remains here is mostly product/content decision-making: final destinations, final funnel choices, and final public-facing links.

## `rizom.ai`

### Public Discord link

Still TBD whether the footer should link to:

- a real public Discord invite, or
- nothing at all (remove the link)

File:

- `apps/rizom-ai/src/layout.tsx`

## `rizom.foundation`

### Newsletter / follow CTA destination

Primary newsletter CTA is still undecided.

Files:

- `apps/rizom-foundation/brain-data/site-content/home/mission.md`
- `apps/rizom-foundation/src/layout.tsx`

### Essay destinations

Research cards and the "Read all essays" CTA still need final URLs.

File:

- `apps/rizom-foundation/brain-data/site-content/home/research.md`

### Event application / RSVP flow

Event links and the higher-level event CTA flow still need final destinations.

File:

- `apps/rizom-foundation/brain-data/site-content/home/events.md`

### Support / contact destinations

Support cards still need final individual + institutional contact destinations.

File:

- `apps/rizom-foundation/brain-data/site-content/home/support.md`

### Hero CTA wording vs destination

"Join our Discord" currently points to an on-page section rather than a real invite.
That may be intentional for now, but final product wording/destination is still TBD.

File:

- `apps/rizom-foundation/src/routes.ts`

## `rizom.work`

### Real quiz URL

Several CTA paths still use placeholder Typeform URLs pending the real quiz destination.

Files:

- `apps/rizom-work/src/routes.ts`
- `apps/rizom-work/src/layout.tsx`
- `apps/rizom-work/brain-data/site-content/home/workshop.md`
- `apps/rizom-work/brain-data/site-content/home/mission.md`

### Discovery call / contact flow

The site currently supports the on-page CTA section flow, but the final booking/contact destination is still TBD.

Files:

- `apps/rizom-work/src/layout.tsx`
- `apps/rizom-work/brain-data/site-content/home/mission.md`

### Proof / case-study finalization

The structure is in place, but the final production choice for named vs anonymized proof is still TBD.

File:

- `apps/rizom-work/brain-data/site-content/home/proof.md`

## Architectural follow-through

The remaining Rizom architecture cleanup is now tracked in:

- `docs/plans/rizom-site-composition.md`

That work is still separate from this product/content backlog. Do not block CTA/link/content cleanup on architectural reshaping unless a missing destination causes a broken runtime, anchor, or public launch issue.

## Recommendation

Treat these as a lightweight product/content backlog.

Do **not** block further technical work on them unless a missing URL causes:

- a broken runtime
- a broken anchor
- a failed build
- a misleading public launch decision
