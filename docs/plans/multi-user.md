# Plan: Multi-User & Permissions

## Context

Brains are single-owner. The permission system has three levels (`anchor`, `trusted`, `public`) but they're interface-scoped — `mcp:stdio` maps to anchor, `discord:*` maps to public. There's no user identity, no accounts, no way to say "Alice is an anchor, Bob is trusted."

This blocks:

- **Relay as a team brain** — multiple people need anchor-level access
- **Hosted rovers** — need to know who owns which rover, who can manage it
- **AT Protocol interactions** — public users engage via Bluesky, need identity tracking
- **Shared editing** — CMS currently has no auth, anyone with the URL can edit

## Current State

### Permission rules (brain.yaml)

```yaml
permissions:
  rules:
    - { pattern: "cli:*", level: "anchor" }
    - { pattern: "mcp:stdio", level: "anchor" }
    - { pattern: "mcp:http", level: "public" }
    - { pattern: "discord:*", level: "public" }
  anchors:
    - "discord:123456789" # specific Discord user ID → anchor
  trusted:
    - "discord:987654321" # specific Discord user ID → trusted
```

### What exists

- `PermissionService` resolves `(interfaceType, userId) → UserPermissionLevel`
- Rules match patterns: `interface:channelOrUserId`
- Override lists: specific user IDs can be promoted to `anchor` or `trusted`
- Tools have `visibility` (`anchor`, `trusted`, `public`) — filtered per permission level
- The agent system prompt changes based on permission level ("you are speaking with your ANCHOR")

### What's missing

- **User model** — no concept of a user beyond a string ID scoped to an interface
- **Cross-interface identity** — Discord user 123 and MCP user "alice" might be the same person
- **Authentication** — interfaces handle auth independently (Discord OAuth, MCP bearer tokens, A2A tokens). No unified auth.
- **User management** — no way to add/remove users, invite collaborators, manage roles
- **Audit trail** — no record of who did what
- **Per-user data** — no way to scope content or conversations to a user

## Design Principles

1. **Identity is external** — brains don't manage user accounts. Identity comes from interfaces (Discord ID, DID, email, API key). The brain maps external identities to permission levels.
2. **Permissions stay simple** — three levels are enough for now. Don't build RBAC unless there's a concrete need.
3. **Progressive complexity** — single-owner brains work exactly as today. Multi-user is opt-in.

## Design

### User entity

A `user` entity type that maps external identities to a brain-level user:

```yaml
---
name: Alice
role: anchor # anchor | trusted | public
identities:
  - type: discord
    id: "123456789"
  - type: did
    id: "did:web:alice.example.com"
  - type: email
    id: "alice@example.com"
joinedAt: "2026-04-01T00:00:00Z"
invitedBy: yeehaa
---
Alice is a team member with full access.
```

One user, multiple identities across interfaces. When Discord user 123456789 connects, the brain resolves them to the `alice` user entity, gets their role, and applies the right permission level.

### Resolution flow

```
Interface receives message from userId
  → PermissionService.resolve(interfaceType, userId)
    → Look up user entity with matching identity
    → Return user's role as permission level
    → Fallback: use pattern rules from brain.yaml (current behavior)
```

Backward compatible — if no user entities exist, brain.yaml rules apply as today.

### User management

For single-owner brains: no change needed. The anchor is implicit (cli/mcp:stdio).

For team brains:

```bash
brain user add alice --role anchor --discord 123456789
brain user add bob --role trusted --email bob@example.com
brain user list
brain user remove bob
```

Or via the agent: "Add Alice as an anchor. Her Discord ID is 123456789."

### Invitation flow (future)

1. Anchor says "invite alice@example.com as trusted"
2. Brain creates a user entity with `role: trusted` and `status: invited`
3. Brain sends invite (email, or generates a join link)
4. Alice connects via an interface, brain matches her identity → activates the user

## What this enables

| Feature                | How                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| Team brains            | Multiple anchors with user entities                               |
| Hosted rovers          | User entity per rover owner, managed by ranger                    |
| AT Protocol            | DID-based identity in user entities                               |
| Shared CMS             | Auth via user identity, role-based access                         |
| Audit trail            | User entity ID on every entity mutation + conversation            |
| Per-user conversations | Conversations linked to user entity, not just interface:channelId |

## Steps

### Phase 1: User entity + resolution

1. Create `user` EntityPlugin in `entities/user/`
2. Schema: name, role, identities, joinedAt
3. Update `PermissionService` to check user entities before pattern rules
4. Backward compatible — no user entities = current behavior
5. Tests

### Phase 2: User management tools

1. `system_user_add` — create user entity with identities
2. `system_user_list` — list users by role
3. `system_user_remove` — delete user entity
4. CLI: `brain user add/list/remove`
5. Tests

### Phase 3: Audit trail

1. Add `userId` field to entity mutations (create, update, delete)
2. Add `userId` to conversation records
3. Queryable: "what did Alice change?" / "show conversations with Bob"
4. Tests

### Phase 4: Cross-interface identity

1. Link multiple interface identities to one user
2. Discord user + DID + email → same user entity
3. Conversation history follows the user across interfaces
4. Tests

## Files affected

| Phase | Files | Nature                                       |
| ----- | ----- | -------------------------------------------- |
| 1     | ~8    | New entity plugin, permission service update |
| 2     | ~5    | User management tools, CLI commands          |
| 3     | ~5    | Audit fields on mutations + conversations    |
| 4     | ~3    | Identity linking, cross-interface resolution |

## Verification

1. Single-owner brain works unchanged (no user entities)
2. Team brain: two users with anchor role can both manage content
3. Discord user resolved to correct permission level via user entity
4. Entity mutations record which user made the change
5. Same person on Discord + MCP recognized as same user
