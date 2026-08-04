# Plan: Lead management — qualification and semantic consolidation

## Status

**Proposed, gated on [email-triage.md](./email-triage.md).** Email triage first turns
untrusted mailbox input into restricted derived `mail-item` records. This plan consumes
only those records; it never subscribes to raw `EMAIL_INBOUND`, owns no mailbox cursor,
and cannot block later mail.

## Goal

Turn qualifying derived mail items into durable leads that consolidate multiple emails
about the same opportunity, remain correctable by an operator, and promote cleanly into
`opportunity` without copying mailbox content or absorbing the deal pipeline.

## What exists today (fact-check)

- No `lead` entity or lead-management service exists.
- Email triage is planned separately and will persist safe derived mail items before it
  acknowledges inbound mail.
- Entity plugins own schemas/adapters but no CRUD tools. Service plugins own background
  jobs, orchestration, narrow tools, and CMS workspaces.
- `context.ai.generateObject(prompt, schema)` supports bounded structured decisions.
- `@brains/business-development` owns the decision-shaped `opportunity` entity and is
  the later promotion target; a lead must not duplicate its value/integrity scoring or
  lifecycle.

## Core decisions

1. **Lead is a separate domain downstream of triage.** `entities/lead`
   (`@brains/lead`) owns the durable entity. `plugins/lead-management`
   (`@brains/lead-management`) owns qualification, candidate resolution, jobs, tools,
   and CMS UX. One `lead-management` capability factory installs both while preserving
   their package boundary.
2. **Only configured mail categories are candidates.** Defaults are `opportunity` and
   `recruiting`; operators may narrow or extend that list in `brain.yaml`. Other mail
   remains useful in Email Triage and can be routed manually later without changing the
   generic triage contract.
3. **Processing starts from durable state.** New qualifying mail items enqueue
   persistent lead-processing jobs. Startup reconciliation can backfill qualifying
   items not referenced by any lead. Job retries never affect the mailbox cursor.
4. **Many sources consolidate into one lead; email is only the automatic one.** A lead
   keeps an ordered list of typed source entity references (`{ entityType, entityId }`,
   the shape unified-inbox already uses for `entityRef`) and an evolving derived
   summary. The entity schema does not know about email; lead-management enforces as
   service policy that automatically attached sources are `mail-item` entities.
   Operators may also create a lead manually — in chat, through the ordinary
   `system_create`/`system_generate` tools — with an empty source list; no bespoke
   creation tool is added. A lead never copies a mail body, exact subject, address,
   header, or message identifier.
5. **AI resolves semantic continuity.** Deterministic thread/sender/person/domain facts
   build a bounded candidate set. One structured call for a qualifying mail item sees
   only the new derived mail item and candidate lead summaries, then returns either
   `create` or `attach` plus the updated derived lead projection. Same sender is not
   enough by itself; when uncertain, create a separate lead. Manually created leads
   without sources enter the candidate set through person/organization matches, so an
   expected email attaches to the lead the operator already opened instead of creating
   a duplicate.
6. **Model-selected IDs are constrained.** An `attach` target must be one of the supplied
   candidate IDs. Unknown IDs, invalid output, and failed generation reject the job and
   retry; the model cannot address arbitrary entities.
7. **Matching indexes are operational, not content.** Rebuildable thread/sender lookup
   maps may live in scoped runtime state and are reconstructed from durable mail items
   and leads. Hashes do not inflate lead frontmatter.
8. **Operator state outranks model output.** AI may update title, kind, fit, summary,
   intent, requested outcomes, value context, timing, constraints, and reply attention.
   It may not overwrite `status` or `opportunityId`. New mail can remain visible in
   Email Triage even when its associated lead is ignored or already promoted.
9. **Promotion and ignoring diverge for new mail.** A `promoted` lead remains an attach
   candidate: its thread and contact facts still match, and attaching keeps the deal's
   email context in one place after promotion. An `ignored` lead is excluded from the
   candidate set — the operator said stop, so later mail from the same sender creates a
   fresh lead when qualifying and otherwise stays visible in Email Triage without
   resurrecting the ignored lead.
10. **Consolidation is reversible.** Admin actions can merge leads, split selected
    sources into a new lead, or reassign a source. Each operation validates source IDs,
    prevents duplicate membership, regenerates affected derived summaries, and is
    confirmation-gated outside the CMS typed workflow.
11. **Fit is qualitative, not fake precision.** `hot | warm | cold` expresses configured
    suitability. Numeric value/integrity scoring starts only after promotion to
    `opportunity`.
12. **The operator surface is a Leads CMS workspace.** It provides fit/status/kind/reply
    filters, lead detail, source-item links, and merge/split/reassignment. A compact
    dashboard card links to the workspace. The shared system tools retain ordinary
    get/update/delete; one narrow `lead_list` tool adds combined filters.
13. **No duplicate attention item.** Email Triage's mail item remains the unified-inbox
    source. Lead management does not register the same arrival again; it supplies the
    business view and later promotion actions.
14. **No automatic push or external action.** Creating and consolidating restricted
    leads is internal and automatic. Reply sending and opportunity promotion remain
    explicit, separately permissioned workflows.

## `lead` entity

```ts
type LeadKind =
  | "project"
  | "employment"
  | "partnership"
  | "commercial"
  | "sponsorship"
  | "other";

type LeadFit = "hot" | "warm" | "cold";
type LeadStatus = "active" | "promoted" | "ignored";

interface LeadFrontmatter {
  title: string;
  kind: LeadKind;
  fit: LeadFit;
  status: LeadStatus;
  needsReply: boolean;

  sources: { entityType: string; entityId: string }[];
  lastActivityAt: string;

  contactPersonIds: string[];
  organization?: string;

  intent: string;
  requestedOutcomes: string[];
  valueContext?: string;
  timing?: string;
  constraints: string[];

  opportunityId?: string;
}

interface LeadMetadata {
  title: string;
  kind: LeadKind;
  fit: LeadFit;
  status: LeadStatus;
  needsReply: boolean;
  lastActivityAt: string;
  organization?: string;
}
```

`sources` is ordered, so message count and latest source are derivable rather than
stored again; it may be empty for a manually created lead that has not yet received
mail. The markdown body contains only the evolving derived opportunity summary and fit
rationale. Draft state belongs to a mail item/reply draft, not the lead.

## Configuration

```yaml
add: [email-triage, lead-management]

plugins:
  lead-management:
    candidateCategories:
      - opportunity
      - recruiting
    fitCriteria: |
      Prefer work aligned with the organization’s declared services and values.
      Treat a concrete decision process and timing as stronger fit evidence.
```

Fit criteria and candidate categories are ordinary explicit plugin configuration. The
capability enters the canonical catalog but no fixed bundle and no generated instance.

## Phased delivery (thin vertical slices, strict TDD)

A phase starts with its behavior matrix committed as failing tests. Implementation does
not begin until those tests are red for the intended reason.

- **Phase 0 — Entity + capability skeleton.** Add `@brains/lead`, its Zod schemas,
  adapter, compound lead-management factory, catalog entry, and stable source
  membership helpers. _Tests first:_ schema constraints; markdown round-trip; metadata
  minimality; restricted visibility; unique ordered `sources` with empty allowed; the
  schema accepts any entity type while the membership helpers constrain automatic
  attachment to `mail-item`; no raw-mail or reply-draft fields; capability activation
  installs entity and service together.
- **Phase 1 — Durable qualification jobs.** Observe qualifying created mail items,
  enqueue persistent processing, reconcile historical unreferenced candidates, and
  guarantee idempotent membership. _Tests first:_ default/configured category gates;
  non-candidates enqueue nothing; replay creates no duplicate job effect; restart
  reconciliation backfills once; processing failure cannot affect inbound
  acknowledgement.
- **Phase 2 — Candidate resolution + consolidation.** Build bounded candidates and use
  an injected structured resolver to create or attach. Update only model-owned fields
  and append source membership atomically from the service's perspective. _Tests first:_
  same opportunity with a new subject attaches; same sender with unrelated work creates;
  multiple contacts at one organization may attach; common/public domains do not force
  a merge; a manually created source-less lead is a candidate via person/organization
  and receives the expected mail; a `promoted` lead attaches new thread mail; an
  `ignored` lead never enters the candidate set; automatic attachment of a
  non-`mail-item` entity rejects; unknown model-selected IDs reject; uncertain output
  creates separately; model failure retries; ignored/promoted status and
  `opportunityId` survive updates; source content never enters persistence or logs.
- **Phase 3 — Operator surfaces and correction.** Add `lead_list`, the admin-only Leads
  CMS workspace, compact dashboard link/counts, and typed merge/split/reassignment.
  _Tests first:_ combined filters and empty states; permissions; workspace lifecycle;
  confirmation boundaries; merge source union; split/reassign membership consistency;
  both affected summaries regenerate; no raw mailbox data appears in responses.
- **Phase 4 — Promotion.** Once `@brains/business-development` is on main, add an
  explicit confirmation-gated promotion that creates an opportunity from derived lead
  context, records `opportunityId`, and sets `status=promoted`. _Tests first:_ mapping
  excludes mail-specific fields; duplicate promotion is idempotent; failed opportunity
  creation leaves the lead active; successful promotion preserves source links.

## Out of scope

- Raw email intake, classification, acknowledgement, and mail-item UX —
  [email-triage.md](./email-triage.md).
- Reply drafting and delivery — [email-reply-drafting.md](./email-reply-drafting.md).
- Deal scoring, ranking, and pipeline state — [bd-priority-engine.md](./bd-priority-engine.md).
- Treating every sender/domain match as one lead.
- Automatic non-email intake until a second concrete source exists; the typed `sources`
  shape already accommodates one without schema migration, and manual creation is in
  scope now.

## Related plans

- [email-triage.md](./email-triage.md) — required durable source records.
- [unified-inbox.md](./unified-inbox.md) — attention remains on open mail items to avoid
  duplicate lead/mail entries.
- [email-reply-drafting.md](./email-reply-drafting.md) — future per-mail-item draft and
  send workflow with optional lead context.
- [bd-priority-engine.md](./bd-priority-engine.md) — promotion target and owner of
  decision ranking.
