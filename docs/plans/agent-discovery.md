# Plan: Agent Discovery Tightening

Last updated: 2026-04-18

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
- new dedicated agent-management tools beyond the existing system tools

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
- archive via `system_update agent`

No new custom tools are required for this round.

### 4. Update tests

Add or update tests for:

- `a2a_call` succeeds for active saved agents
- `a2a_call` refuses archived agents
- `a2a_call` refuses unknown agents even if a URL/domain is provided
- successful A2A calls do not create new `agent` entities

## Follow-up

After this tightening round, the next likely step is a separate phase for refreshing and revalidating already-saved agents.

That should remain a separate decision from discovery itself.
