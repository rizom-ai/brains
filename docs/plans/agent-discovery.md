# Plan: Agent Discovery Follow-up

Last updated: 2026-04-26

## Status

The original tightening pass is effectively landed. This doc is now intentionally collapsed: it keeps the current contract and the remaining follow-up scope, but drops the stale step-by-step migration detail.

Delete or replace this file once the remaining views work moves into its own dedicated plan.

## Landed contract

The agent directory is now the explicit local allowlist for outbound A2A calls.

Current behavior:

- outbound `a2a_call` resolves only through a saved local `agent` entry
- `a2a_call` expects one exact saved local agent id, not a display name or raw URL
- unknown, URL-only, ambiguous, or archived agent targets are refused instead of being called directly
- invalid agent-contact requests do **not** create wishlist items or other fallback entities
- approval uses `system_update` with `fields: { status: "approved" }`
- archive/remove uses `system_update` with `fields: { status: "archived" }`
- approval persistence is durable end-to-end because agent frontmatter is rebuilt from metadata on write
- repeated explicit saves are idempotent, and explicit-save generation jobs coalesce without retries
- save-first follow-up eval fixtures use unique domains so multi-turn tests do not leak state through shared agent IDs

## Current status model

Status is still intentionally narrow:

- `discovered` = saved locally for review, not callable yet
- `approved` = saved locally, explicitly allowed, callable
- `archived` = no longer callable from the active directory

The important nuance is **how the agent was added**:

- **explicit user add/save** flow → save/create or refresh the local entry as `approved`
- **review/discovery/import-style** flow → may still produce `discovered`

So the system should not describe all newly added agents as `discovered`, and it should not describe all agent creation flows as immediate approval either.

## Current default user flows

### Explicit add/save

User explicitly asks to add or save an agent.

- assistant uses `system_create` with `entityType: "agent"` and `url`
- runtime creates or refreshes the saved directory entry
- that explicit save behaves as approval for the saved entry

### Review/discovery

Agent arrives through a discovery or review-oriented path.

- runtime may create or refresh the saved entry as `discovered`
- discovered entries are visible locally but not callable yet

### Approve

User explicitly approves a discovered agent.

- assistant uses `system_update` on the saved `agent`
- update must use `fields: { status: "approved" }`

### Call

User asks to call an agent.

- assistant uses `a2a_call` only when it has one exact saved local agent id
- approved entries are callable
- discovered entries require approval first
- missing, ambiguous, archived, or raw-URL targets must be clarified, saved, unarchived, or approved first

### Archive / remove

User explicitly asks to archive or remove a saved agent.

- assistant uses `system_update`
- update must use `fields: { status: "archived" }`

## Remaining work

This plan is no longer about core calling semantics. Remaining work is mostly follow-up:

1. **Views pass**
   - tighten list/detail UX around discovered vs approved vs archived
   - improve empty states, counts, filters, and review affordances
   - add lightweight dashboard widgets such as summary, recent discoveries, and top skills

2. **Optional maintenance/automation**
   - refresh or revalidate saved agents
   - health checks and bulk maintenance if needed
   - only if existing CRUD flows stop being enough

3. **Trust remains separate from status**
   - do not overload `discovered` / `approved` / `archived` with relationship strength
   - any future trust, ranking, or delegation model should be a separate axis

## Still out of scope

- ATProto / firehose discovery
- trust scoring or ranking inside core agent status
- automatic cross-agent identity reconciliation
- new dedicated management tools beyond normal system tools unless CRUD stops being sufficient

## Deletion criteria

This collapsed doc can be removed once:

- the remaining views work has its own narrower plan, or
- the follow-up scope is fully landed and no active planning value remains.
