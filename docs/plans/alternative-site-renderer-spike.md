# Plan: Alternative Site Renderer Spike

## Status

Parked research probe. Not scheduled. Nothing depends on it.

This is the surviving question from the site-build robustness work, which shipped
deterministic preparation, transactional output, structured diagnostics,
cancellation, and artifact accounting. That work deliberately kept Preact as the
renderer and did not attempt a replacement. It did, however, leave the seam a
replacement would need.

## Why this is now answerable

A site build is prepared into `PreparedSiteBuild` before any rendering happens: a
frozen, JSON-serializable snapshot of routes, resolved section data, metadata,
images, scripts, and static assets, holding no service callbacks or component
functions. Rendering performs no entity or datasource reads.

That is the interesting part. A renderer no longer needs the shell, the entity
service, or the datasource layer — it needs a JSON document, a staging
directory, and a way to report progress. Whether a different renderer is
worth having is a question that can now be tested cheaply, in isolation,
without a second runtime pipeline.

## Question

Does any renderer other than Preact earn its place, given that the authoring
surface, site packages, and themes are all Preact today?

Not "can Astro render this" — almost certainly yes. The question is whether the
gain is worth a second authoring surface, a second set of template bindings, and
the migration that would follow.

## Shape of the probe

Run only as a time-boxed feasibility exercise, and only if something forces the
question up the queue.

1. Consume a serialized `PreparedSiteBuild` fixture. The deterministic renderer
   test already produces one.
2. Render into the same staging directory contract, producing artifacts the
   existing manifest validation accepts unchanged.
3. Cover one authored route, one entity list route, one entity detail route,
   images, route-scoped scripts, metadata, and theme CSS.
4. Compare against the Preact baseline: output equivalence, build time,
   dependency cost, diagnostic quality, and what authoring a section looks like.

## What would make it worth pursuing

Any of:

- a material build-time reduction on a site the size of the largest real one
  (~140 routes, ~18 MB of HTML);
- a meaningfully better authoring experience for non-Preact contributors; or
- a capability the current renderer cannot reach — islands, partial hydration,
  or per-route runtime strategies — that the site actually needs.

Absent all three, the answer is no, and this file should be deleted rather than
kept as an open question.

## Non-goals

- Do not ship two runtime pipelines or a pipeline selector.
- Do not require existing site or theme packages to change.
- Do not treat Astro as a predetermined outcome; it is one candidate.
- Do not begin this while anything on the product roadmap is unblocked by it.

## Plan retirement

Delete this file when the probe runs and answers the question either way, or
when it becomes clear the question does not matter.
