# Plan: Shared Space Trust

## Status

Proposed. This is a smaller, earlier permission improvement than full runtime multi-user. It is especially important for Relay, where the product assumption is often: people invited into the same team space should be treated as collaborators.

This plan can land before `multi-user.md` because it does not require auth-user records, passkey/session migration, user-management UX, or replacing `single-operator`.

## Goal

Let configured shared spaces act as trust boundaries. A caller who is a member of an explicitly configured shared space receives `trusted` permission by default, while owner/admin authority remains explicit.

For Relay, this means a Discord server/channel, Slack workspace/channel, Teams space, or future shared web workspace can be configured as a collaborator space. Members of that space can use trusted Relay workflows without every member first becoming a runtime auth user.

## Current baseline

- Permission levels already exist: `public`, `trusted`, `anchor`.
- `PermissionService` currently resolves permissions from explicit anchors/trusted lists and rules such as `discord:<id>`.
- Relay is a team/collaboration brain, but current permission mapping is still mostly per-user/per-interface id.
- Full runtime multi-user is planned separately in `multi-user.md`.
- Some interfaces have richer context than just user id, such as guild/server/channel/team/workspace ids.

## Core decisions

1. **Shared spaces grant collaborator trust, not owner authority.**
   - Members of configured spaces resolve to `trusted`.
   - `anchor` remains explicit through existing anchors/rules or future runtime users.
2. **Shared-space trust can ship before runtime multi-user.**
   - No auth-user store is required.
   - No passkey/session subject migration is required.
   - No People/user-management UI is required.
3. **Spaces must be explicitly configured.**
   - Do not infer trust from any arbitrary Discord server, Slack workspace, or room.
   - Operators choose which spaces are collaborator spaces.
4. **Public and guest users remain possible inside or outside spaces.**
   - A caller outside configured spaces remains `public` unless another rule grants more.
   - A future signed-in guest can still map to `public`.
5. **Owners are not the same as space members.**
   - Space membership should never imply access to anchor-only tools.
   - Secrets, deploy, user management, and destructive operator actions stay anchor-only.
6. **Deny/blocked state wins.**
   - Interface-level blocked users/bots/guests should be excluded before granting shared-space trust.
   - When runtime multi-user lands, suspended users override shared-space trust.
7. **Keep the three enforcement levels for now.**
   - UX labels can be Owner / Collaborator / Guest.
   - Do not add `admin` or `guest` as core permission levels in this plan.

## Configuration shape

Add an optional shared-space permission config alongside existing permission rules. Exact location can be decided during implementation; conceptually:

```yaml
permissions:
  sharedSpaces:
    - interface: discord
      guildId: "123456789"
      channelIds: ["987654321"] # optional; omitted means whole guild/server
      level: trusted
      includeBots: false
    - interface: slack
      workspaceId: T123
      channelIds: [C123, C456]
      level: trusted
```

Constraints:

- `level` should initially only allow `trusted`.
- `anchor` via shared-space config is out of scope.
- Interface-specific ids should remain strings to avoid precision loss.
- Config should support whole-space and narrower channel/room trust.

## Permission resolution

Before full runtime multi-user, resolve in this order at interface boundaries:

1. Explicit deny/block checks, if the interface provides them.
2. Existing explicit anchor/trusted user rules from `PermissionService`.
3. Configured shared-space membership grants `trusted`.
4. Existing pattern rules/fallback behavior.
5. Default `public`.

After runtime multi-user lands, the combined order should become:

1. Runtime auth-user suspended/deny checks.
2. Explicit runtime auth-user role.
3. Interface deny/block checks.
4. Existing explicit anchor/trusted user rules.
5. Configured shared-space membership grants `trusted`.
6. Existing pattern rules/fallback behavior.
7. Default `public`.

The important invariant: shared-space trust can raise a caller to `trusted`, but never to `anchor`.

## Interface requirements

Interfaces that want shared-space trust must provide normalized context to permission resolution:

```ts
interface SharedSpaceContext {
  interfaceType: string; // discord, slack, teams, etc.
  userId: string;
  guildId?: string;
  workspaceId?: string;
  teamId?: string;
  channelId?: string;
  roomId?: string;
  isBot?: boolean;
  isGuest?: boolean;
}
```

Discord should be the first target for Relay if that is the active shared-space interface.

## Relay UX

Relay-facing copy can say:

- “People in this configured space are collaborators.”
- “Collaborators can use team workflows, but only Owners can manage secrets, deployment, users, and other owner-only tools.”
- “Guests and people outside configured spaces have public access.”

This gives Relay a practical team model before full accounts:

- Invite person to configured space → collaborator/trusted behavior.
- Explicit anchor config → owner behavior.
- Outside the space → public behavior.

## Entity action policy follow-up

Shared-space trust makes `trusted` easier to grant, so tool-level visibility may become too coarse. Today a trusted caller can use broad system mutation tools such as create/update/delete if those tools are visible. Before shared-space trust is enabled broadly for Relay, add a later policy layer for entity-type/action overrides.

Conceptual config:

```yaml
permissions:
  entityTypes:
    "*":
      create: trusted
      update: trusted
      delete: anchor
    topic:
      create: anchor
      update: anchor
      delete: anchor
    summary:
      create: anchor
      update: anchor
      delete: anchor
```

Policy checks should live in the central system mutation tools, not each entity plugin:

- `system_create`
- `system_update`
- `system_delete`
- `system_set-cover`
- `system_extract`

Recommended Relay direction:

- collaborators can create/update team-authored content such as notes, links, docs, decisions, and action items;
- deletion defaults to Owner/anchor only;
- derived/system-maintained entities such as topics, summaries, SWOTs, and agent directory records are more restricted by default;
- denial messages should say which role is required for that entity action.

This is intentionally later than basic shared-space trust, but should happen before treating large shared spaces as trusted by default.

## Phased implementation

### Phase 1 — Config and resolver

- Add shared-space config schema.
- Add a resolver helper that checks whether interface context matches configured shared spaces.
- Keep output limited to `trusted`.
- Add tests for whole-space and channel-limited matches.

Validation:

- matching configured space grants `trusted`
- non-matching space remains `public`
- configured channel grants `trusted` only in that channel
- shared-space config cannot grant `anchor`

### Phase 2 — Discord/Relay integration

- Pass Discord guild/channel/user/bot context into permission resolution.
- Enable Relay docs/config examples for trusted Discord spaces.
- Ensure bots are excluded unless explicitly allowed.

Validation:

- member in configured Relay Discord space receives trusted tools
- same user outside configured space falls back to existing rules/public
- bot user does not receive trusted by default
- explicit anchor user remains anchor

### Phase 3 — Other chat interfaces

Add Slack/Teams/shared web workspace support as those interfaces mature.

### Phase 4 — Entity action policy overrides

- Add entity-type/action permission policy config.
- Enforce it in central system mutation tools.
- Keep initial defaults backward compatible where needed, then tighten Relay defaults.
- Move broad delete authority for collaborators behind policy; Relay should default deletes to anchor/Owner.

Validation:

- trusted users can create/update allowed Relay entity types
- trusted users cannot delete by default
- protected derived entity types require anchor for mutation
- anchor users retain full mutation ability
- denial messages identify the required role/action

## Security notes

- Treat configured spaces as trust boundaries; document this clearly.
- Do not auto-trust every server/workspace the bot can see.
- Do not grant anchor from shared-space membership.
- Prefer narrow channel/room trust when operators only want one team area trusted.
- Keep a deny/block path available for bad actors inside an otherwise trusted space.

## Non-goals

- Runtime auth-user records.
- Passkey/session migration from `single-operator`.
- User-management tools or People UI.
- Full fine-grained RBAC.
- Admin as a fourth permission level.
- Public self-signup or invitations.

## Relationship to other plans

- `docs/plans/multi-user.md` — later explicit runtime users, roles, identities, MCP per-session permissions, and user management.
- `docs/plans/relay-presets.md` — Relay should be the first product beneficiary.
- `docs/plans/chat-interface-sdk.md` — future unified chat interfaces should carry shared-space context consistently.

## Done when

1. Operators can configure trusted shared spaces.
2. Relay callers inside configured spaces resolve to `trusted`.
3. Space membership never grants `anchor`.
4. Existing explicit anchors/rules continue working.
5. Unknown/outside callers remain `public`.
6. Later entity action policies can restrict high-risk mutations, especially delete.
