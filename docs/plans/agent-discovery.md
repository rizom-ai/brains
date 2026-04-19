# Plan: Agent Discovery Tightening

Last updated: 2026-04-19

## Goal

Make the agent directory the explicit allowlist for outbound A2A calls.

That means:

- agents must be saved in the local directory before they can be called
- first contact must not auto-create durable `agent` entities
- `a2a_call` should resolve only through saved `agent` entries

## Why

The current first-contact auto-create behavior mixes two separate actions:

1. calling a remote agent
2. saving a remote agent as a durable local contact

That creates surprising side effects and weakens the meaning of the directory.

The cleaner model is:

- **add agent** = explicit trust / approval
- **call agent** = only for approved directory entries
- **archive agent** = remove from the callable set

## Desired behavior

### Add

User asks to add an agent.

- assistant uses `system_create` with `entityType: "agent"`
- runtime fetches the remote Agent Card
- local `agent` entity is created from the card

### Call

User asks to call an agent.

- assistant uses `a2a_call`
- tool looks up the target in local `agent` entities only
- if found and active, call succeeds
- if missing, tool returns a clear error telling the user to add the agent first
- if archived, tool refuses to call it

### No implicit persistence

A successful A2A call must not create or save a new `agent` entity.

## Scope

### In scope

1. remove first-call auto-create
2. make `a2a_call` directory-only
3. update tool/error wording to match the new model
4. add or update tests for the new contract

### Out of scope

- ATProto / firehose discovery
- periodic refresh/upsert of known agents
- trust scoring or ranking
- new dedicated agent-management tools beyond the existing system tools for basic directory operations

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
- archive/unarchive agent → `system_update agent`
- call agent → `a2a_call`

That means the main expansion surface after tightening is likely **views** first, not a new dedicated tool layer.

For this repo, “actions” should mostly continue to mean existing system tools plus occasional automation when CRUD is no longer enough.

## Implementation steps

### 1. Remove auto-create subscription

Delete the best-effort create-on-first-call flow:

- stop subscribing to `a2a:call:completed`
- remove `entities/agent-discovery/src/lib/auto-create.ts`
- remove plugin registration of that behavior

### 2. Tighten `a2a_call`

In `interfaces/a2a/src/client.ts`:

- require lookup through local `agent` entities
- remove direct URL / bare-domain fallback for unknown agents
- keep the archived-agent refusal path
- return a clear error such as:
  - `Agent yeehaa.io is not in your directory. Add it first.`

### 3. Keep manual add/list/archive flows

Preserve the existing directory flows:

- add via `system_create agent`
- list via `system_list agent`
- archive or unarchive via `system_update agent`

No new custom tools are required for this round. Existing tools already cover the basic directory actions.

### 4. Update tests

Add or update tests for:

- `a2a_call` succeeds for active saved agents
- `a2a_call` refuses archived agents
- `a2a_call` refuses unknown agents even if a URL/domain is provided
- successful A2A calls do not create new `agent` entities

## Planned next phase: views pass

Once the tightening work lands, the next pass should focus on **views**, using existing data before adding new schema fields.

### Principle

Prefer the smallest useful views pass:

- stay read-only on current fields where possible
- avoid schema churn until the views clearly demand it
- prefer analytical, grounded visualizations over decorative graph UIs

Current data already supports useful views based on:

- `status`
- `discoveredAt`
- `discoveredVia`
- `kind`
- `skills`

### Pages

#### Improve current directory pages

Use the existing `agent-list` and `agent-detail` surfaces first.

Priority improvements:

- list page: clearer counts, better empty states, simple filters such as active vs archived
- detail page: stronger archived treatment
- detail page: use the already-available `prevAgent` / `nextAgent` navigation

#### Add visualization-oriented pages

The first visualization pages should be grounded in existing data:

1. **Discovery timeline**
   - agents grouped by discovery date or month
   - useful for understanding growth and recency
2. **Capabilities view**
   - agents grouped by shared skills
   - more of a clustered browse view than a graph

Avoid starting with a relationship graph or force-directed network view. The current model has little or no edge data, so a graph would mostly be decoration.

### Widgets

Add small, glanceable dashboard widgets using the existing dashboard registration pattern.

Recommended first widgets:

1. **Directory Summary**
   - total agents
   - active vs archived
   - by kind
   - by discovery source
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
3. add a discovery timeline page
4. add a capabilities page

## Follow-up

After the views pass, the next likely expansion area is **automation / orchestration**:

- refreshing and revalidating already-saved agents
- health checks
- dedupe or bulk maintenance flows
- only if existing CRUD flows stop being sufficient

Those should remain separate decisions from the core discovery contract itself.
