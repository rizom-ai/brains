# Plan: Accessibility audit and alt text

## Status

Proposed, with a deadline: everything below is released and deployed to the fleet by **Thursday 19 November 2026, evening Taipei time**. The Rizom Foundation's Mozilla Human-Scale AI application, which closes Friday 20 November 2026 at 23:59 PST, answers that accessibility is "a significant part of our design approach". The application's accessibility sentence is written from what this plan ships. If it has not reached production by the deadline, that answer goes back to "considered, but not yet a focus".

## Baseline

- `scripts/console-visual/capture.ts` injects axe-core and checks console screens against `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` during `bun run visual:console`, on local fixtures only.
- [studio-ux-improvements.md](./studio-ux-improvements.md) keeps the manual pass: screen-reader announcements, focus order and restoration, obscured content, contrast cases axe marks incomplete, and dialog isolation. This plan does not repeat it.
- An image's `alt` is set at creation to its title, its prompt's first 60 characters, `cover-<target>` or its id (`entities/image/src/create-routes.ts`). Nothing writes a description of what the image shows. The January `image_describe` tool no longer exists; the vision model now only describes uploads for a text-only model.

## Goal

1. A repeatable axe audit of the surfaces people use on a live brain, with every critical and serious finding fixed.
2. Images a brain publishes carry alt text that describes them, written by the brain's own vision model and editable by the owner.

## Non-goals

- No conformance claim. The audit report states what was checked and fixed, not that a surface conforms.
- No manual screen-reader pass here; it stays in studio-ux-improvements.md.
- No alt text for images inside markdown bodies that are not image entities.

## Decisions

- **Surfaces.** Studio chat, a Studio Library note page, the web-chat guest page, and rizom.ai/ask. They are what a person and a visitor actually use, and what the application's video shows.
- **Standard and threshold.** The same axe tags as the console capture (WCAG 2.0–2.2, A and AA). Critical and serious findings are fixed; moderate and minor ones are recorded in the report with a decision each.
- **One runner.** The audit and the console capture share one axe helper (`scripts/accessibility/axe-audit.ts`) rather than adding `@axe-core/playwright`. CI audits the Studio fixture surfaces through `visual:console --a11y`; `bun run a11y:audit` audits given URLs.
- **Studio behind sign-in.** Production Studio needs the owner's passkey, so Studio surfaces are audited on a test app at the released version, signed in with Chrome's virtual authenticator (`--setup`, then `--passkey`). The public surfaces are audited on production.
- **Climates.** Studio is audited in instrument and paper; the paper climate is where the baseline findings are.
- **Report.** `docs/accessibility-audit.md` records the date, the surfaces, findings before and after per surface, and each fix with its PR.
- **Alt text source.** The image metadata gains `altSource: "fallback" | "generated" | "owner"`; an image without it is `fallback`. A generated description never overwrites `owner`.
- **When alt text is written.** As soon as a public image is ready (its bytes stored, whether generated, uploaded or rendered) and its `altSource` is `fallback`, and when a restricted image is made public. A one-time catch-up at start-up queues the public images that still carry a fallback. The job asks for one sentence of at most 125 characters describing what the image shows: the configured local `visionModel`, else the cloud model, which reads images itself. It stores the sentence with `altSource: "generated"`. SVG images are skipped.
- **Owner edits.** Studio opens an image with its preview and two editable fields, title and alt, in the image field of the entry that uses it (images have no Library page). An update that changes `alt` without setting `altSource` (Studio or the agent) marks it `owner`.
- **Rendering.** Sites render a cover image with the image's own alt, not the post's title; the site builder carries it beside the cover URL to every template that draws a cover.

## Phases

### 1. Audit runner and baseline (Wednesday 18 November) — done

The helper, `bun run a11y:audit` and the baseline in [accessibility-audit.md](../accessibility-audit.md): four paper-climate `color-contrast` findings in Studio and one `aria-hidden-focus` on rizom.ai/ask, all serious; nothing critical, moderate or minor.

### 2. Fix critical and serious findings (Thursday 19 November) — fixed, not yet deployed

- One commit per finding class, each with a test or fixture assertion that fails before the fix.
- Rerun the audit; the report gets the after counts and the fixes.
- Release and deploy to yeehaa.io, team.rizom.ai and rizom.ai, and rerun the audit against production.

Done when production shows no critical or serious findings on the four surfaces.

### 3. Alt text from the vision model (Thursday 19 November) — built, not yet deployed

- Test first, slice by slice: the image job writes a fake vision model's sentence and skips `owner`; a public ready image queues the job and an alt edit marks `owner`; a cover renders the image's alt; Studio saves an image's title and alt.
- Slices: `altSource` and the describe job; the image describer on the AI service and entity runtime; the image listener with its start-up catch-up; cover alt through the site builder and templates; Studio image editing.
- Verify with a local vision model (`qwen3-vl:8b` or the configured `visionModel`) and with the cloud default.
- Release and deploy with phase 2.

Done when a newly published image on a production brain carries generated alt text that its owner can edit.

## Validation

- `bun run typecheck`, the image entity and Studio tests, `bun run lint`, and `bun run visual:console`.
- The audit script against production after deploy, with the results in the report.
