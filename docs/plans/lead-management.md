# Plan: Lead management — inbound qualification on the opportunity lifecycle

## Status

**Proposed, gated on the shared `opportunity` entity owned by
[bd-priority-engine.md](./bd-priority-engine.md).** Email Triage is on main through
Phase 2A and already provides the durable `mail-item` source records. Decided
2026-08-04: a lead is not a separate entity; it is an `opportunity` in the `lead`
lifecycle state. This plugin consumes only durable mail items, never subscribes to raw
`EMAIL_INBOUND`, owns no mailbox cursor, and cannot block later mail.

## Goal

Turn qualifying derived mail items into lead-state opportunities that consolidate
multiple emails about the same deal, remain correctable by an operator, and graduate
into scored, prioritized states by a confirmation-gated transition on the same record —
never by copying into a second entity.

## What exists today (fact-check)

- No lead-management service and no `lead` entity exist; none will be added.
- Email Triage on main persists safe derived `mail-item` records before acknowledging
  inbound mail and ships its own operator surfaces (Phases 0–2A).
- The `opportunity` entity is in flight on `feat/opportunity-priority-engine` and needs
  the single-entity rework described in
  [bd-priority-engine.md](./bd-priority-engine.md): a shared `entities/opportunity`
  package, a `lead` state, and typed `sources`.
- Entity plugins own schemas/adapters but no CRUD tools. Service plugins own background
  jobs, orchestration, narrow tools, and CMS workspaces.
- `context.ai.generateObject(prompt, schema)` supports bounded structured decisions.

## Core decisions

1. **One entity, two services.** `entities/opportunity` (`@brains/opportunity`) owns
   the durable entity. `plugins/lead-management` (`@brains/lead-management`) owns
   intake, semantic consolidation, and correction of `lead`-state items.
   `@brains/business-development` owns scoring, ranking, and attention over committed
   states. The services have no direct package dependency or API calls; both depend on
   the entity package and coordinate only through entity state and confirmed system
   tools.
2. **A lead is an opportunity in `state=lead`.** There is no promotion copy, no
   `opportunityId` back-pointer, and no second record: qualification is a state
   transition on the same entity, and its sources and history remain attached for the
   deal's whole life. The qualitative `fit` field is dropped — the lifecycle stage and
   the eventual scores carry that meaning.
3. **Only configured mail categories are candidates.** Defaults are `opportunity` and
   `recruiting`; operators may narrow or extend the list in `brain.yaml`. Other mail
   remains useful in Email Triage and can be routed manually without changing the
   generic triage contract.
4. **Processing starts from durable state.** New qualifying mail items enqueue
   persistent lead-processing jobs. Startup reconciliation can backfill qualifying
   items not referenced by any opportunity. Job retries never affect the mailbox
   cursor.
5. **Many sources consolidate into one record; email is only the automatic one.** The
   entity keeps an ordered list of typed source references (`{ entityType, entityId }`).
   The schema does not know about email; this service enforces as policy that
   automatically attached sources are `mail-item` entities. Operators may create a
   lead-state opportunity manually through ordinary `system_create` with a text source
   and an empty source list; no bespoke creation or generation tool is added. The
   record never copies a mail body, exact subject, address, header, or message
   identifier.
6. **AI resolves semantic continuity.** Deterministic thread/sender/person/domain facts
   build a bounded candidate set. One structured call per qualifying mail item sees
   only the new derived mail item and candidate summaries, then returns either `create`
   or `attach` plus the updated derived projection. Same sender is not enough by
   itself; when uncertain, create separately. Manually created source-less leads enter
   the candidate set through person/organization matches, so an expected email attaches
   to the record the operator already opened.
7. **Model-selected IDs are constrained.** An `attach` target must be one of the
   supplied candidate IDs. Unknown IDs, invalid output, and failed generation reject
   the job and retry; the model cannot address arbitrary entities.
8. **Matching indexes are operational, not content.** Rebuildable thread/sender lookup
   maps may live in scoped runtime state and are reconstructed from durable mail items
   and opportunities. Hashes do not inflate frontmatter.
9. **The lifecycle stage gates write authority.** While `state=lead`, AI may update the
   derived narrative fields: title, intent, requested outcomes, value context, timing,
   constraints, `needsReply`, and the summary body. Once the record leaves `lead`, AI
   writes shrink to bounded factual updates — append-only sources plus current
   `needsReply` and `lastActivityAt` — and the narrative belongs to the humans working
   the deal. In every state, AI never
   writes `state`, scores, owner, or deadline.
10. **Attach candidacy follows state.** `lead`, `active`, `staged`, and `warm` records
    are attach candidates — new mail on a worked deal lands on the deal. `closed`
    records are excluded: the operator said stop, so later qualifying mail creates a
    fresh lead and everything else stays visible in Email Triage without resurrecting
    the closed record.
11. **Consolidation is reversible.** Admin actions can merge records, split selected
    sources into a new lead, or reassign a source. Each operation validates source IDs,
    prevents duplicate membership, and is confirmation-gated outside the CMS typed
    workflow. Affected `lead` summaries regenerate; committed narratives remain
    human-owned. Merge into a committed record keeps its state and scores.
12. **Qualification replaces promotion.** Graduating a lead is one confirmed
    `system_update` that sets `state=active|staged|warm` and complete scores on the same
    record. Business Development's installed instructions supply the rubric; this
    package exposes the record and context but neither imports nor invokes Business
    Development. Ignoring a lead is this package's separate Admin action and sets
    `state=closed` without scores. Neither transition is taken by consolidation model
    calls.
13. **The operator surface is a Leads CMS workspace.** It shows `state=lead` records
    with type/reply filters, detail with source-item links, and merge/split/reassign.
    A compact dashboard card links to it. One narrow `lead_list` tool adds combined
    filters; ordinary operations stay on the shared system tools. Committed states
    belong to business-development's stack and focus surfaces.
14. **No duplicate attention item.** Email Triage's mail item remains the unified-inbox
    source. Lead management does not register the same arrival again; it supplies the
    business view.
15. **No automatic push or external action.** Creating and consolidating restricted
    lead-state records is internal and automatic. Reply sending, qualification, and
    ignore remain explicit Admin workflows. The shared entity persist validator rejects
    any non-restricted opportunity.

## Entity

The `opportunity` schema — including the `lead` state, typed `sources`, the derived
narrative fields this service writes, and the stage-gated refinements — is owned by
[bd-priority-engine.md](./bd-priority-engine.md). This plan adds no fields; it is a
consumer with a defined write set (decision 9).

## Configuration

```yaml
add: [email-triage, opportunity, lead-management]

plugins:
  lead-management:
    candidateCategories:
      - opportunity
      - recruiting
    qualificationGuidance: |
      Prefer work aligned with the organization’s declared services and values.
      Treat a concrete decision process and timing as stronger evidence.
```

Guidance and candidate categories are ordinary explicit plugin configuration.
`opportunity` is selected separately so Lead Management and Business Development can
share one entity registration without either service factory installing it. The
capability enters the canonical catalog but no fixed bundle and no generated instance.

## Phased delivery (thin vertical slices, strict TDD)

A phase starts with its behavior matrix committed as failing tests. Implementation does
not begin until those tests are red for the intended reason. Every phase is gated on
the reworked `entities/opportunity` package landing first.

- **Phase 0 — Service skeleton + membership helpers.** Add `@brains/lead-management`
  with candidate-category config, stable source-membership helpers, and catalog entry.
  _Tests first:_ category gate defaults and overrides; membership helpers reject
  duplicate and non-`mail-item` automatic sources; capability activation requires the
  entity package.
- **Phase 1 — Durable qualification jobs.** Observe qualifying created mail items,
  enqueue persistent processing, reconcile historical unreferenced candidates, and
  guarantee idempotent membership. _Tests first:_ non-candidates enqueue nothing;
  replay creates no duplicate job effect; restart reconciliation backfills once;
  processing failure cannot affect inbound acknowledgement.
- **Phase 2 — Candidate resolution + consolidation.** Build bounded candidates and use
  an injected structured resolver to create or attach. Update only stage-permitted
  fields and append membership atomically from the service's perspective. _Tests
  first:_ same deal with a new subject attaches; same sender with unrelated work
  creates; multiple contacts at one organization may attach; common/public domains do
  not force a merge; a manually created source-less lead is a candidate via
  person/organization and receives the expected mail; an `active|staged|warm` record
  attaches new thread mail without narrative rewrites; a `closed` record never enters
  the candidate set; unknown model-selected IDs reject; uncertain output creates
  separately; model failure retries; `state`, scores, owner, and deadline survive every
  service write; source content never enters persistence or logs.
- **Phase 3 — Operator surfaces and correction.** Add `lead_list`, the admin-only Leads
  CMS workspace, compact dashboard link/counts, and typed merge/split/reassignment.
  _Tests first:_ combined filters and empty states; permissions; workspace lifecycle;
  confirmation boundaries; merge source union and committed-state preservation;
  split/reassign membership consistency; affected lead summaries regenerate while
  committed bodies remain unchanged; no raw mailbox data appears in responses.
- **Phase 4 — Qualification handoff and ignore.** Add the Admin-only typed ignore action
  (`lead → closed`) and expose enough derived context for the ordinary confirmed
  `system_update` qualification flow validated by the shared entity schema and guided
  by Business Development instructions. Do not import or call Business Development.
  _Tests first:_ ignore closes without scores; qualification requires state plus
  complete confirmed scores; failed/cancelled confirmation leaves the record in `lead`;
  a qualified record disappears from lead-only surfaces; sources and history survive
  either transition; no raw mail content enters the handoff.

## Out of scope

- Raw email intake, classification, acknowledgement, and mail-item UX —
  [email-triage.md](./email-triage.md).
- Reply drafting and delivery — [email-reply-drafting.md](./email-reply-drafting.md).
- Scoring rubric, ranking, focus, and heartbeat —
  [bd-priority-engine.md](./bd-priority-engine.md).
- Treating every sender/domain match as one record.
- Automatic non-email intake until a second concrete source exists; the typed `sources`
  shape already accommodates one without schema migration, and manual creation is in
  scope now.

## Related plans

- [email-triage.md](./email-triage.md) — required durable source records.
- [bd-priority-engine.md](./bd-priority-engine.md) — owns the shared `opportunity`
  entity and the committed-state surfaces.
- [unified-inbox.md](./unified-inbox.md) — attention remains on open mail items to avoid
  duplicate entries.
- [email-reply-drafting.md](./email-reply-drafting.md) — future per-mail-item draft and
  send workflow with optional lead context.
