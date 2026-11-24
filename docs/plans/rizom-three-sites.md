# Plan: Three Rizom sites — platform, work, foundation

Last updated: 2026-11-24

## Status

**Mockups only. Nothing is migrated.** The static mockups are the visual and content contract for this plan:

- [rizom.ai](../design/rizom-three-sites/rizom-ai.html), which opens with the network map and tells the Brain story, and its [docs page](../design/rizom-three-sites/rizom-ai-docs.html)
- [rizom.work](../design/rizom-three-sites/rizom-work.html)
- [rizom.foundation](../design/rizom-three-sites/rizom-foundation.html), its [Common Sense reading page](../design/rizom-three-sites/rizom-foundation-common-sense.html) and its [founding-supporters page](../design/rizom-three-sites/rizom-foundation-support.html), the text of `~/Documents/fundraising/become-a-founding-supporter.html` of 21 November

They are built from snapshots of today's live rizom.ai pages: the story layout, the rail, the room accents, the components and the built `main.css`, `story.css` and `story.js` are the live ones. Each site has a new drawing, written in the live organism format and rendered by the site's own `sites/rizom-ai/src/story/organism.tsx`, so it moves exactly like today's drawings but follows the new chapters: `rizom.ai` opens with today's network map and continues with the Brain stages, `rizom.work` draws heroics, the team's shared memory, a hub, a setup and a public body, and `rizom.foundation` draws members' Brains, the curated selection, no one in the middle, the gatherings, gifts and a sponsor, and the Foundation beside the licensed B.V. Their specs are in [organisms.ts](../design/rizom-three-sites/organisms.ts). The team-memory science from today's homepage moves to `rizom.work`. `three-sites.css` holds only the strip, the wordmark suffix, the open-decision boxes and the reading and docs layouts.

The copy is public material only: the public text of Common Sense, today's rizom.ai copy and the public parts of the Rizom angles. Anything that needs a decision first is shown as a dashed "Open decision" box, never filled in.

This plan supersedes the July 2026 consolidation target "one brain, one site" (the deleted `rizom-consolidation` plan; commit `dc6629d348` removed the `rizom-work` and `rizom-foundation` site packages). The rover-pilot separation plan lists "Splitting the Rizom platform, work, and foundation website rooms again" as a non-goal; that line is revised in rover-pilot when Phase 1 starts.

## Goal

Three sites, each speaking for one party, and no docs subdomain.

| Site               | Speaks for               | Holds                                                                                          | Accent    |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- | --------- |
| `rizom.ai`         | the open-source platform | the Brain, its documentation (replacing `docs.rizom.ai`), Ask the network, the quick start     | brass     |
| `rizom.work`       | Rizom B.V.               | hub Brains, team Brains and their setups, partners, contact                                    | ruby-soft |
| `rizom.foundation` | the Rizom Foundation     | Common Sense, members' writing (curated), the commons, events, founding supporters, governance | moss      |

`docs.rizom.ai` disappears: its pages move to `rizom.ai/docs/*` and `rizom.ai/guides/*` and the subdomain redirects there.

## Why split again

The July consolidation was operational: three deployments became one, with one content repo, one runtime lineage and the ATProto registry on `rizom.ai`. It was settled before the Foundation's role was written down.

Common Sense (November 2026) makes the separation itself the claim. The Foundation owns the code, the method and the Rizom name; Rizom B.V. runs hosting and client work under license and pays 25% of every engagement back; an independent board majority decides on the license, the name and the company. On one site whose main button is "Book an audit", a founding supporter reads that claim on the B.V.'s sales page. Funders fund the Foundation in its own name and should land on its own site.

Moving the commercial offer off the `.ai` domain also fits the framing: Rizom is about memory and coordination, with AI as the timing, not the product.

The cost is two more brains to run: servers, certificates, content repos and upgrades. Phase 1 starts the Foundation site small for that reason.

## Decisions

1. **Three domains, roles as in the goal table.** The platform is the commons' software and belongs to neither the sales side nor the institution, so it keeps `rizom.ai`, its subdomains, the brain card and the lexicon authority.
2. **One brain per domain.** The deploy path serves exactly one apex (plus `www` and `preview`) per brain, and a foreign domain per brain is shipped (`users/thefourth.yaml`). One brain serving three domains would need host-based routing in the site builder and multi-host proxy and TLS work; it is not pursued.
3. **One theme.** All three sites use `@rizom/theme-rizom-ai`, each with its room accent fixed (`data-room`), as the rooms do today. All three share a three-site strip at the top and a footer with one column per site.
4. **Site packages revive the old names.** `@rizom/site-rizom-work` and `@rizom/site-rizom-foundation` (npm-deprecated at `0.2.0-alpha.235`) are published again above that version, built with `createRizomSite` and the existing `workSections` and `foundationSections`, with a single-room layout.
5. **One content repo per brain.** `rizom-ai/rizom-work-content` and `rizom-ai/rizom-foundation-content` receive `site-content/work/*` and `site-content/foundation/*` from `rizom-content`, following the `thefourth` precedent.
6. **Docs live on `rizom.ai`.** `@rizom/site-rizom-ai` renders `doc` and `guide` entities at `/docs/<slug>` and `/guides/<slug>`; the release workflow syncs them into `rizom-content`; the docs brain is retired.
7. **Events have one calendar**, on `rizom.foundation`. The other two sites link to it.
8. **Members' writing is curated on `rizom.foundation`.** The Foundation selects; every article stays published on its author's own Brain, and the Foundation stores a pointer, never a copy (see below).
9. **Public material only** until the open decisions below close. No testimonials, client names or board names without the decision and, for clients, their consent.
10. **No pledge deadline on the site.** As on the founding-supporters page of 21 November, the public text asks for €50,000 in founding support without a date; the 31 December date stays in material for the board.
11. **The board is named.** `rizom.foundation` lists the board by name and role, the four independent members marked as such: the independent majority is part of what the site asks readers to check, and an ANBI must publish its board.
12. **The Foundation has its own voice.** The newsletter (essays and research) moves from the `rizom.ai` brain to the `rizom.foundation` brain with its subscribers, and the Foundation publishes as `@rizom.foundation` on ATProto. `@rizom.ai` stays the platform's account and the lexicon authority.

## Open decisions before migration

Content, for Jan Hein and the board:

- prices for hub Brains, member Brains, setups and the monthly fee (a B.V. decision);
- client references, with consent;
- which team members appear on `rizom.work`, in which roles;
- whether `rizom.ai` keeps a `/writing` index for product writing;
- one spelling standard across the three sites (Common Sense uses US spelling, the angle copy UK).

## Members' writing on `rizom.foundation`

How a brain features a curated selection of other brains' articles is its own plan, `curated-member-posts.md` (branch `plan/curated-member-posts`), so it can be built and released independently of this one. Until it ships, `rizom.foundation` features members' articles as hand-authored rows, as in Phase 1 below.

## Phases

### Phase 0 — mockups and plan (this change)

### Phase 1 — `rizom.foundation`, small, before 31 December 2026

The founding pledge round closes on 31 December, so the Foundation site goes first with only what the round needs:

1. `@rizom/site-rizom-foundation` with Common Sense, members' writing as hand-authored rows (the shipped `foundation:research` row shape), events, founding supporters and why a foundation, in six chapters that follow its new organism, plus the Common Sense and founding-supporters reading pages, as in the mockup. The mockup's organism spec becomes `foundation-organism.tsx`.
2. Content repo `rizom-ai/rizom-foundation-content`.
3. rover-pilot `users/rizom-foundation.yaml`: `domainOverride: rizom.foundation`, `cloudflareZoneId`, `profileKind: organization`, `contentRepoOverride`, exact `siteOverride` pins, and `addOverride` with at least `site-content` and `contact`. A cohort with the `site` bundle.
4. `brains-ops cert:bootstrap --handle rizom-foundation`, `secrets:encrypt`, push, then `verify-user`.
5. Remove the Cloudflare 301 on the `rizom.foundation` zone; redirect `rizom.ai/foundation*` to `rizom.foundation`.
6. An ANBI page with what the status requires the Foundation to publish: name, RSIN, contact details, objective, policy plan, board composition and names, remuneration policy, a report on activities and the financial statement.
7. The newsletter moves: `newsletter` joins the Foundation brain's `addOverride` and leaves `rizom-ai`'s, the subscriber list moves with it, and subscribers are told once that the Foundation now sends it. The Foundation's `users/rizom-foundation.yaml` gets its own `atproto` block for the `rizom.foundation` handle; `rizom-ai` keeps `lexiconAuthority`.

If Phase 1 cannot ship by mid-December, the founding-supporters section goes on `rizom.ai/foundation` as a stopgap and Phase 1 follows in January.

### Phase 2 — `rizom.work`

The same steps for `@rizom/site-rizom-work`, `rizom-ai/rizom-work-content` and `users/rizom-work.yaml`, with the hub and team offer replacing the Knowledge Audit, the team-memory science moved in from today's homepage, contact topics `hub` and `team`, the zone 301 removed and `rizom.ai/work*` redirected to `rizom.work`. "Book an audit" leaves the `rizom.ai` bar. The mockup's organism spec becomes `work-organism.tsx`.

### Phase 3 — `rizom.ai` becomes platform and docs

1. Home opens with today's network map and tells the Brain story, with "Measure. Connect. Coordinate." after the collective, as in the mockup; its organism spec joins the site package. `/brain` redirects to `/`, `/ask` stays, and the team-memory science moves to `rizom.work`.
2. `@rizom/site-rizom-ai` gains `entityDisplay` entries for `doc` (plural `docs`) and `guide`, and a `/docs` route from the `docs:doc-home-*` and `guides:guide-*` templates; the bar and footer link `/docs`.
3. rover-pilot `users/rizom-ai.yaml` adds `docs` and `guides` to `addOverride`.
4. The release workflow's "Sync docs content repo" step writes `doc/` and `guide/` into `rizom-content` instead of `doc-brain-content`.
5. `docs.rizom.ai/*` redirects to `rizom.ai/docs/*` and `/guides/*`; the docs home `/` maps to `/docs`.
6. The docs brain is offboarded and `@rizom/site-docs` is deprecated.

### Phase 4 — curated members' writing

When `curated-member-posts.md` ships, its section replaces Phase 1's hand-authored rows.

## Redirects

| From                                | To                                        | Phase |
| ----------------------------------- | ----------------------------------------- | ----- |
| `rizom.ai/foundation*`              | `rizom.foundation`                        | 1     |
| `rizom.ai/work*`                    | `rizom.work` (`#audit` to the team offer) | 2     |
| `docs.rizom.ai/docs/*`, `/guides/*` | `rizom.ai/docs/*`, `/guides/*`            | 3     |
| `docs.rizom.ai/`                    | `rizom.ai/docs`                           | 3     |

## References to update

- **A colour error on the live site:** `.chapters` in `sites/rizom-ai/src/story.css` paints solid `--color-bg` over the page's `--bg-noise` texture, and `.bg-nav-fade` hides it in the bar, so beside the 1440px frame the sides look lighter. Fixed in the site package and theme by [PR #1037](https://github.com/rizom-ai/brains/pull/1037), ahead of the split: on the full grid the chapters column paints nothing and the drawing's wash fades out toward the text, and the bar's fade keeps the texture. The mockups carry the same fix in `three-sites.css`.
- `sites/rizom-ai/src/layout.tsx` footer and bar, and `rizom-content` `site-content/brain/quickstart.md` (both link `docs.rizom.ai`)
- `sites/hub` links to `rizom.ai/work` and `rizom.ai/foundation`
- `sites/rizom-ai/src/rizom/ui/ecosystem-content.ts`
- the docs brain's network node and A2A peer (`did:web:docs.rizom.ai`), and eval test cases citing `docs.rizom.ai/guides/*`
- [brand.md](../brand.md) ("one brain, one site"), `docs/architecture/package-structure.md`, `DESIGN.md`
- `TRADEMARKS.md` says the marks are held by Rizom B.V. with the intention to transfer them to the Foundation, while Common Sense says the Foundation owns the name; the Foundation site should not claim more than is true on the day it launches

## Validation

- Each phase starts the brain locally, triggers a site rebuild on the running app through the app command surface, and compares `dist/site-preview` with its mockup in dark, light and phone widths.
- After deploy, `verify-user` passes and every redirect is checked from the root and a deep path.
- `rizom.ai` remains the ATProto lexicon authority and card publisher; the new brains publish their own cards as `did:web:rizom.work` and `did:web:rizom.foundation`.

## Risks

- **Capacity.** Two more brains to operate while the team is small. Phase 1 stays minimal and Phase 4 waits for demand.
- **Moving the audience.** Newsletter subscribers and ATProto followers sit on `@rizom.ai` today; subscribers move with the newsletter and are told once, and followers are pointed to `@rizom.foundation` from the platform account.
- **The pledge deadline.** The stopgap in Phase 1 keeps the round from depending on a new deployment.
