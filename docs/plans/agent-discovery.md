# Plan: Agent Discovery Tightening

Last updated: 2026-04-19

## Goal

Keep the agent directory as the explicit allowlist for outbound A2A calls, and make the next expansion pass primarily about views.

That means:

- agents must be saved in the local directory before they can be called
- first contact must not auto-create durable `agent` entities
- `a2a_call` should resolve only through saved `agent` entries
- follow-up work should improve pages and widgets before adding new schema or dedicated tools

## Why

The old first-contact auto-create behavior mixed two separate actions:

1. calling a remote agent
2. saving a remote agent as a durable local contact

That creates surprising side effects and weakens the meaning of the directory.

The cleaner model is:

- **discover agent** = save for review, not callable yet
- **approve agent** = explicitly allow calls
- **call agent** = only for approved directory entries
- **remove agent** = delete the live record entirely; git history preserves the past

## Desired behavior

### Add

User asks to add an agent.

- assistant uses `system_create` with `entityType: "agent"`
- runtime fetches the remote Agent Card
- local `agent` entity is created from the card
- new agents should enter as `discovered` unless the flow explicitly indicates immediate approval

### Approve

User asks to approve a discovered agent.

- assistant uses `system_update` on the saved `agent`
- status changes from `discovered` to `approved`

### Call

User asks to call an agent.

- assistant uses `a2a_call`
- tool looks up the target in local `agent` entities only
- if found and `approved`, call succeeds
- if found and `discovered`, tool refuses to call it and tells the user to approve it first
- if missing, tool returns a clear error telling the user to add it first

### No implicit persistence

A successful A2A call must not create or save a new `agent` entity.

## Current status

The core tightening contract is already landed.

Current behavior:

- first-contact A2A calls do not auto-create durable `agent` entities
- `a2a_call` only accepts a saved local agent id
- unknown agents are refused with an explicit “add it first” error
- only `approved` agents are callable
- newly added agents default to `discovered`
- tests cover the no-auto-create and directory-only behavior

## Scope

### In scope

1. keep the tightened directory-only contract explicit in docs and UX
2. simplify agent status to `discovered | approved`
3. improve list/detail views and add lightweight widgets
4. clarify identity, dedupe, and approval behavior
5. add or update tests for the views-facing contract where needed

### Out of scope

- ATProto / firehose discovery
- periodic refresh/upsert of known agents
- trust scoring or ranking
- new dedicated agent-management tools beyond the existing system tools for basic directory operations
- cross-agent merge logic or automated identity reconciliation

## Architectural framing for future expansion

This tightening round keeps the agent directory model intentionally small.

Future expansion should be thought about in four buckets:

1. **Data**
   - agent schemas, metadata, markdown shape, and derivation
   - owned by `entities/agent-discovery`
2. **Views**
   - **pages** via templates, data sources, and routes
   - **widgets** via dashboard registration
3. **Interface behavior**
   - A2A resolution, calling rules, and Agent Card ingestion
   - owned primarily by `interfaces/a2a`
4. **Automation / orchestration**
   - only when behavior goes beyond normal CRUD flows
   - examples: bulk refresh, health checks, dedupe, import/export, scheduled sync

Basic directory actions should continue to rely on the existing system tools where possible:

- add agent → `system_create agent`
- list agents → `system_list agent`
- approve agent → `system_update agent`
- call agent → `a2a_call`
- remove agent → normal entity deletion flow

That means the main expansion surface after tightening is likely **views** first, not a new dedicated tool layer.

For this repo, “actions” should mostly continue to mean existing system tools plus occasional automation when CRUD is no longer enough.

## Identity and routing rules

To keep the directory contract unambiguous:

- the allowlist key is the saved local `agent` entity id
- today that id is domain-based
- outbound A2A calls must resolve from the saved directory entry, not from fresh user input
- user input should only select which saved agent to call

Identity should distinguish between the represented anchor and the callable brain:

- `name` = anchor identity (person, team, or collective)
- `brainName` = the specific brain instance name

This distinction matters if one anchor can operate multiple brains.

Practical implication:

- the system should treat the saved record as authoritative for where calls go
- `brainName` is required in the durable model
- if endpoint ownership later needs to diverge from the root domain, that should be expressed by saved agent data rather than by reintroducing URL passthrough at call time

## Status and trust model

Keep status narrow and operational:

- `discovered` = saved locally, reviewable, not callable yet
- `approved` = saved locally, explicitly allowed, callable

Do not use status for relationship strength.

A future trust or relationship system should be a separate axis, potentially token-based, for things like:

- inner circle
- preferred ranking
- delegation rights
- richer context sharing

That means `trusted` should be treated as a future trust label or tier, not as a core status.

## Add / refresh / duplicate semantics

Keep the first rule simple:

- adding an agent creates or refreshes a saved directory entry keyed by the saved agent id
- re-adding the same saved id should refresh the existing record rather than create a second copy
- newly added agents should default to `discovered` unless the UX explicitly approves them during creation
- duplicate detection across different domains is out of scope for this pass
- if DID-based reconciliation becomes necessary later, it should be handled as explicit automation work, not hidden inside normal add/call flows

## Basic CRUD flows remain the default

Preserve the existing directory flows:

- add agent → `system_create agent`
- list agents → `system_list agent`
- approve agent → `system_update agent`
- call agent → `a2a_call`
- remove agent → delete the live `agent` entity

No new custom tools are required for this round. Existing tools already cover the basic directory actions.

## Planned next phase: views pass

With the tightening work landed, the next pass should focus on **views**, using existing data before adding new schema fields.

### Principle

Prefer the smallest useful views pass:

- stay read-only on current fields where possible
- avoid schema churn until the views clearly demand it
- prefer analytical, grounded visualizations over decorative graph UIs

Current data already supports useful views based on:

- `status`
- `discoveredAt`
- `kind`
- `skills`
- `brainName`

In the near term, the most important status split is:

- `discovered` for review queues
- `approved` for normal callable directory entries

### Pages

#### Improve current directory pages

Use the existing `agent-list` and `agent-detail` surfaces first.

Priority improvements:

- list page: clearer counts, better empty states, and a simple discovered vs approved filter
- list page: default to approved agents while making discovered entries easy to review
- detail page: stronger discovered treatment with an explicit “approve before calling” state
- detail page: use the already-available `prevAgent` / `nextAgent` navigation

#### Add visualization-oriented pages

The first visualization pages should be grounded in existing data:

1. **Discovery timeline**
   - agents grouped by discovery date or month
   - useful for understanding growth and recency
2. **Capabilities view**
   - agents grouped by shared skills
   - more of a clustered browse view than a graph
   - normalize skill grouping at least by casing and exact-name cleanup before presenting “top” capability buckets

Avoid starting with a relationship graph or force-directed network view. The current model has little or no edge data, so a graph would mostly be decoration.

### Widgets

Add small, glanceable dashboard widgets using the existing dashboard registration pattern.

Recommended first widgets:

1. **Directory Summary**
   - total agents
   - discovered vs approved
   - by kind
2. **Recent Discoveries**
   - recent agents as a grouped list or mini timeline
3. **Top Skills**
   - most common skills across saved agents

Preferred widget visual language:

- counts
- pills
- bars
- grouped sections
- lightweight timelines

Avoid graph-heavy widgets in the first pass.

### Order of work

1. tighten the existing list/detail pages
2. add directory summary and recent discoveries widgets
3. normalize skill grouping for capability browsing
4. add a capabilities page
5. add a discovery timeline page

## Follow-up

After the views pass, the next likely expansion areas are:

### Automation / orchestration

- refreshing and revalidating already-saved agents
- health checks
- dedupe or bulk maintenance flows
- only if existing CRUD flows stop being sufficient

### Trust / relationship systems

- token-based trust signals
- inner-circle or preferred-contact tiers
- delegation policy beyond simple callability

### Schema tightening

- keep `brainName` required because every brain has its own stable name
- keep `discoveredVia` out of the durable model unless source provenance becomes product-relevant later

Those should remain separate decisions from the core discovery contract itself.
