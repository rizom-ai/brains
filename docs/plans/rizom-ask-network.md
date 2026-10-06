# Plan: the live network on /ask as a bioluminescent sky

## Status

Decided 2026-10-06 from three studies in [docs/design/rizom-ask-network](../design/rizom-ask-network/): `night-sky.html` (A), `orbits.html` (B) and `bioluminescent.html` (A2). A2 is the one to build. Nothing of it is on `main` yet.

## Goal

The drawing beside the Ask box on rizom.ai/ask reads as the brand's night sky rather than a radar: Rizom is the densest light, tendrils fork outward toward the brains and thin as they reach, every brain is a layered light that breathes on its own clock, energy travels a tendril to a brain now and then, the brains not yet in reach are dust at the periphery, and an answer makes the cited brains flare while the rest withdraw. The language is [docs/design/bioluminescent-infrastructure.md](../design/bioluminescent-infrastructure.md) and the brand book's Visual Identity.

## Baseline

- `sites/rizom-ai/src/story/network.ts` places every brain that is not archived with `proximityPoint` on a disc of radius 44 by raw bearing, and picks the side of its name; `NetworkLayer` in `src/opening.tsx` draws three dashed rings, a spoke from the centre to every brain, a dashed kin line, a pulse ring every seven seconds with an echo and a spark per brain, two dashed coronas and the lantern, plus HTML marks (`ul.net-marks > li.net-mark[data-brain][data-ask-mark] > a[aria-label] > i`) and HTML names (`ol.net-names > li.net-name[data-brain]`).
- The story runtime (`src/story/runtime.ts`) lights `.net-mark`, `.net-thread`, `.net-reply` and `.net-name` by `data-brain` on `ask:cited` (`is-lit`, `is-hot`), and sets `has-replies` and `is-rizom` on `.net-layer`. The shared Ask room script (`@brains/site-atlas`) finds marks by `data-ask-mark` and `aria-label`, draws leads to the marks' screen rectangles for one second after `ask:sources` and on scroll and resize, and lends the drawing (`data-ask-drawing`) to a phone's open conversation.
- The `.story.is-asked` state (an Asked-before question open) hides the pulse, echo and spark and stops the marks' flare.
- Live data: nine brains, one kin link, bearings concentrated in one sector, so six lights and their names pile up on the right while three quarters of the disc are empty.

## Decisions

1. **Placement keeps the data and opens the sky.** Each brain keeps its reach (distance over the map's maximum) as its radius, `11 + reach × 33`, so near brains clear Rizom's corona; bearings are relaxed halfway toward an even spread in bearing order. Order and nearness stay true; piling does not. Names sit outward; at the drawing's right edge (`x ≥ 78`) a name sits centred below its light so it stays in the frame.
2. **Tendrils, not spokes.** Brains in bearing order are paired; each pair shares a trunk from Rizom to a fork at about 45% of the nearer brain's radius, then a branch per brain, all quadratic curves with a seeded wobble (the seed is a hash of the brain ids, so the drawing is stable for the same network). The branch carries class `net-thread` and `data-brain`, so the runtime's lighting and hovering need no change.
3. **The kind is the core.** The HTML mark's `i` stays the visible core, the hit target and the lead anchor: filled for a person, a ring for a team, a dotted ring for an organisation, via `data-kind`. No glyph in the names. The legend lives in the mark's shape, not in text.
4. **A light is layered in the SVG under the mark.** Per brain a `g.net-reply[data-brain]` holds a wide amber halo, an ember rim where it meets the dark, a ripple and a bead; halo size follows nearness. Rizom is a corona gradient, the lantern and seven slow embers. The substrate is a radial amber wash at the centre, a faint off-centre purple boundary, grain masked to fade at the edge, and `pendingCount` lilac dust motes beyond the far lights (capped at 40, seeded).
5. **Motion is CSS only.** Each light breathes on its own period; the whole sky (`div.net-sky`, which wraps the SVG, the marks and the names so they move together) drifts ±1.1° over 140 s; light seeps along the trunks; on a shared cycle of 5.2 s per brain a bead travels each brain's tendril (`offset-path`) and the brain's halo swells as it arrives; embers circle; dust twinkles. `has-replies` and `is-asked` pause the drift, the seep and the transfers, so leads stay on their marks. Reduced motion turns everything off and hides the beads. No pointer parallax.
6. **An answer.** `is-lit` on the branch brightens it to brass-soft with an ember glow; `is-lit` on the light flares the halo and rim and runs its bead once; `has-replies` dims every other light and branch; `is-hot` brightens a branch and its core as today. The centre lantern keeps its `is-rizom` rule.
7. **Contracts unchanged.** The layer's position rules (sticky at the figure's centre line on a wide screen, the fixed strip on a phone, the lending slot), `data-ask-drawing`, `data-ask-mark`, `aria-label`, the runtime's selectors and the room script's lead geometry stay as they are; the old `.net-ring`, `.net-pulse`, `.net-echo`, `.net-spark`, `.net-corona` and the dashed kin go.

## Slices

One PR, one commit per slice, each green on its own.

### 1. Geometry

`placeNetwork` returns the relaxed placement with `kind`, the name side (`right | left | above | below`), the tendrils (trunk path, branch path per brain) and the dust. Tests in `test/story/network.test.ts`: reach kept and radius `11 + reach × 33`; bearing order kept with a relaxed angle; the right-edge name below; one trunk per pair and a branch per brain, every path starting where the previous ends; dust count follows `pendingCount` and its cap; an empty map draws nothing.

### 2. The drawing

`NetworkLayer` renders the sky: defs, substrate, dust, tendrils, kin, replies, corona, embers, lantern, grain, then the marks and names. Stylesheet rules for every new class, the old ones removed. Tests: `test/ask-room.test.tsx` pins the new structure and the kept contracts; a stylesheet test pins the layered light, the core by kind and the removal of the rings and the pulse.

### 3. Motion and the answer

Breathing, drift, seep, transfers, embers, dust, the answer flare and bead, the pauses on `has-replies` and `is-asked`, reduced motion. Tests: a stylesheet contract for each, including the pause and the reduced-motion block; `test/story/runtime-script.test.ts` fixtures updated to the new markup.

### 4. Ship

Verified on the local test app at 1440×900 and 390 wide, with an injected `ask:sources` event for the answer state (never a paid guest message). Then PR, release, fleet pin, production build, live check of `/ask`.
