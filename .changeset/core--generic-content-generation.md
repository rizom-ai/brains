---
"@rizom/brain": patch
---

Move multi-target content generation out of the site plugin and into the shell, so sites, books, courses, and other sectioned compositions share one schema-first pipeline. `shell/content-service` now validates structured destinations, checks template capability and existing output, applies force and dry-run semantics, and enqueues admitted work. Generated entities receive domain-owned metadata instead of mandatory route and section fields, and a generation-only template with no React layout can generate and persist non-web content.

Destinations use structured `idPath` segments with a shared entity-path codec that serializes to the stored entity ID only at the persistence boundary, so callers never concatenate separators. `plugins/site-content` becomes a site adapter that keeps route discovery and filtering while delegating planning, admission, and persistence.

Entity-service gains atomic absent/revision preconditions, so a stale or retried job conflicts instead of overwriting a later edit; no table or migration is added. Durable jobs carry the trusted caller, resolved account, and an admission-time permission ceiling; authority is resolved when the job starts and again at the entity write boundary, where revocation blocks persistence. Scoped retrieval fixes knowledge and identity reads to the authorized output visibility, so public output uses public retrieval even for an admin caller.

Admitted children share one root job ID, which is the returned batch ID, so the queue's existing durable root index recovers them after a restart. Generation jobs run at most once: they are enqueued without retries and never fail after their commit, so an interrupted worker leaves a failed job to re-run rather than regenerating or resurrecting output. The job queue itself is unchanged.

External authors reach the capability declaratively through `@rizom/brain/services`: generation definitions on service templates, `content.target()` handles bound to public entity definitions with inferred metadata, `content.generate()` for heterogeneous targets, and `contentGenerationResultSchema` for tool output. Completion is observed by reading the destination entity through existing typed readers.

The brain's own command line now has one identity, `service:brain-cli`, shared by the bundled runtime and the monorepo runner, and every brain grants it admin by permission rule at the app layer. Admission takes the lower of that rule and the level the CLI asserts, so `--permission` still lowers a call, and a job admitted from the CLI re-resolves the same authority at its write. Before this the monorepo runner asserted no level at all, and no brain granted the CLI anything, so any tool that enforces entity-action policy refused it.
