# Plan: Multi-User & Permissions

## Goal

Add a real user model on top of the existing permission levels so brains can support multiple people, shared editing, hosted ownership, and cross-interface identity.

## Open work

### 1. Add a user entity model

Brains need a durable user entity that maps one person to one or more external identities.

Required fields:

- display name
- role / permission level
- identities across interfaces
- lifecycle metadata such as join time or invite status

This must stay backward compatible with the current rule-based permission model.

### 2. Resolve permissions through users before falling back to rules

Permission resolution should become:

1. try to match the caller to a user entity
2. use that user's role
3. fall back to `brain.yaml` pattern rules if no user exists

The current single-owner path must continue to work unchanged when no user entities exist.

### 3. Add user-management tools and CLI support

Needed management surface:

- create user
- list users
- remove user
- attach identities to users

This should work through both tools and CLI commands.

### 4. Add audit attribution

Entity mutations and conversation records need a durable user identity so operators can answer:

- who changed this?
- who talked to the brain?
- which user owns this action history?

### 5. Support cross-interface identity

A single person may appear through Discord, MCP HTTP, DID-based protocols, email-linked flows, or future interfaces.

Those identities should be linkable to one user record so permissions and history follow the person rather than a single interface-local identifier.

### 6. Decide whether invitation flow is worth building

Invitation / onboarding flow is follow-on work, not a prerequisite for the base user model.

Only build it if team/operator workflows actually need it.

## Non-goals

- full RBAC beyond the current coarse permission levels
- a first-party account system owned by the brain
- replacing interface-specific authentication mechanisms

## Dependencies

- `docs/plans/hosted-rovers.md`
- `docs/plans/brain-oauth-provider.md`
- `docs/plans/a2a-request-signing.md`

## Done when

1. brains can represent users durably
2. permission resolution can use those users
3. operators can manage users through tools/CLI
4. mutations and conversations can be attributed to users
5. the single-owner path still works without migration
