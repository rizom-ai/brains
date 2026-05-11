# Plan: Multi-User & Permissions

## Status

Proposed. Near-term, sequenced after the OAuth/passkey foundation: new installs can move from `single-operator` toward real runtime auth users while existing permission-rule fallback remains compatible.

## Goal

Add a real user model so a brain can support multiple people across OAuth/passkeys, MCP, Discord, A2A, and future interfaces without breaking the current single-owner/self-hosted path.

The first version should stay small: coarse permission levels, explicit operator-managed users, no SaaS account system, and no route-wide dashboard/CMS lock-down.

## Current baseline

- Permission levels already exist: `public`, `trusted`, `anchor`.
- Permission resolution is currently rule based through `PermissionService` and interface-local ids such as `discord:<id>` or `mcp:http`.
- Brain OAuth currently issues tokens for a single subject: `single-operator`.
- Passkeys, sessions, OAuth clients, signing keys, auth codes, and refresh tokens live in runtime auth storage (`./data/auth`) and must **not** move under `brain-data`.
- Dashboard operator visibility is widget-level, not route-level.

## Core decisions

1. **Auth users are runtime auth state, not content.**
   - User auth records, roles, identity bindings, and passkey bindings live under runtime auth storage.
   - They are not synced/exported with `brain-data`.
   - Optional public/person profile content can link to a user id later, but it is not the source of auth truth.
2. **Keep coarse permission levels for v1.**
   - `anchor` = owner/admin/operator authority.
   - `trusted` = collaborator authority for safe write workflows.
   - `public` = unauthenticated or minimal access.
   - Full RBAC is explicitly out of scope for the first multi-user slice.
3. **User lookup precedes rule fallback.**
   - If an interface caller maps to an auth user, use that user role.
   - If no user matches, fall back to existing `brain.yaml` permission rules.
   - Existing single-owner configs continue working unchanged.
4. **First passkey setup creates the first anchor user.**
   - Replace the durable `single-operator` subject with a real user id for new setups.
   - Existing `single-operator` installs migrate lazily to a first anchor user.
5. **Per-request/session permissions must replace global HTTP MCP anchor.**
   - OAuth-authenticated MCP should use the token subject's user role.
   - Static `MCP_AUTH_TOKEN` can continue to grant anchor as a deprecated fallback.
6. **Do not reshuffle existing tool visibility in the plumbing phase.**
   - Multi-user v1 makes roles enforceable.
   - A later tool-permission audit decides which existing anchor tools can safely become trusted.
7. **Operator-managed onboarding first; invitations later.**
   - Anchors create users and explicitly attach identities.
   - Email/self-signup/invite delivery is deferred until real workflows need it.

## Runtime user record

Store in runtime auth storage, e.g. `./data/auth/oauth-users.json`.

```ts
interface AuthUserRecord {
  id: string; // stable user id, e.g. usr_<uuid>
  displayName: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  identities: AuthUserIdentity[];
  createdAt: number;
  updatedAt: number;
}

interface AuthUserIdentity {
  type: "oauth" | "passkey" | "discord" | "mcp" | "a2a" | "email" | "did";
  issuer?: string;
  subject: string;
  label?: string;
  verifiedAt?: number;
}
```

Identity keys should normalize to strings for lookup, for example:

- `oauth:<issuer>:<subject>`
- `passkey:<credential-id>`
- `discord:<snowflake>`
- `email:<lowercase-email>`
- `did:<did>`

Passkey credential public keys remain in the passkey store; user records only bind to credential ids/subjects.

## Architecture

### New auth-user service

Add `shell/auth-service` user-store support rather than a separate content entity plugin for v1:

- `AuthUserStore`
  - loads/saves `oauth-users.json`
  - creates first anchor user
  - lists users
  - finds user by id
  - finds user by normalized identity key
  - attaches/detaches identities
  - updates role/status
- `AuthService`
  - creates/reuses first anchor user during setup
  - passkey registration stores credential with `subject = user.id`
  - passkey login creates operator session with `subject = user.id`
  - OAuth access-token `sub` becomes user id
  - exposes `resolveUserForRequest()` / `resolveBearerUser()` helpers

### Permission resolution

Do not make the existing pure `PermissionService` entity-aware. Instead, add a resolver layer at shell/interface boundaries:

1. Normalize interface identity (`mcp:<subject>`, `discord:<id>`, etc.).
2. Ask `AuthService`/user store for a matching active user.
3. If found, use `user.role`.
4. If not found, call `PermissionService.determineUserLevel(interfaceType, userId)`.

This keeps existing rule behavior intact and avoids making permission checks async everywhere. A small in-memory identity index can make lookups synchronous after auth-service initialization.

### MCP HTTP sessions

Current HTTP MCP sets the whole transport to `anchor` when auth is configured. Multi-user needs per-authenticated-session permission:

- `verifyBearerToken` should return `{ subject, scope, userId, permissionLevel }`.
- `StreamableHTTPServer.authenticate()` should retain verified identity for the request/session.
- When creating a new MCP session, call `mcpTransport.createMcpServer(permissionLevel)` for that session.
- Existing session id should continue with the permission level established at initialize time.
- Static `MCP_AUTH_TOKEN` fallback remains anchor-only and deprecated.

### Dashboard visibility

- Dashboard widget visibility should use the same levels as tools: `public`, `trusted`, `anchor`.
- Existing `operator` visibility is accepted as a backward-compatible alias for `anchor`, but new code/docs should use permission-level names.
- Dashboard login/logout continue using operator sessions, but sessions now carry a real user id and role.
- Signed-in masthead can display the user's display name, e.g. `Alex · sign out`.

### Conversations, jobs, and audit attribution

Add user attribution without polluting content frontmatter as the first step:

- Conversation metadata:
  - `userId`
  - `displayName`
  - `permissionLevel`
  - `interfaceIdentity`
- Message metadata for user messages:
  - same user fields where available
- Job metadata:
  - `requestedByUserId`
  - `requestedByInterface`
- Tool context:
  - extend `ToolContext` with optional `actor?: { userId; displayName; permissionLevel }`

Entity mutation audit can be follow-on:

- either append runtime audit events
- or add `createdBy` / `updatedBy` metadata only for entity types that opt in

Avoid writing auth-sensitive identity bindings into content markdown.

## Management surface

### Tools

Add anchor-visible tools:

- `user_list`
- `user_create`
- `user_update_role`
- `user_suspend`
- `user_attach_identity`
- `user_detach_identity`
- `user_start_passkey_registration`
- `user_revoke_passkey`

### CLI

Add wrappers where useful:

```bash
brain user:list
brain user:create --display-name "Jane" --role trusted
brain user:update-role usr_... --role anchor
brain user:suspend usr_...
brain user:attach-identity usr_... --type discord --subject 123456789
```

Keep `brain auth reset-passkeys --yes` as the break-glass reset for all passkeys and active OAuth state.

### Operator-managed onboarding

For v1, onboarding is explicit and operator managed:

1. Anchor creates a user (`brain user:create ...`).
2. Anchor attaches one or more known identities (`brain user:attach-identity ...`).
3. For passkeys, anchor generates a short-lived registration URL for that specific user (`brain user:start-passkey-registration usr_...`).
4. The user opens the URL and registers a passkey; the credential binds to that user id.

There is no public registration, email invitation, or self-signup in the first slice.

## Migration strategy

### Fresh installs

1. No passkeys and no users.
2. First `/setup` creates `usr_<uuid>` with role `anchor`.
3. Passkey credential stores `subject = usr_<uuid>`.
4. Operator sessions and OAuth tokens use `sub = usr_<uuid>`.

### Existing installs with `single-operator`

On startup or first successful login:

1. Detect passkeys or sessions with `subject = "single-operator"`.
2. If no users exist, create first anchor user.
3. Rebind passkey credentials from `single-operator` to that user id.
4. Future sessions/tokens use the real user id.
5. Revoke old `single-operator` refresh tokens during migration for safety and force affected OAuth clients through a clean one-time re-auth.

## Phased implementation

### Phase 1 — Auth user store and first-user migration

- Add `AuthUserStore` and tests.
- Create first anchor user during setup.
- Rebind passkey subject from `single-operator` to user id.
- Issue OAuth tokens with user-id `sub`.
- Keep single-owner behavior if no users exist.

Validation:

- fresh setup creates user + passkey
- login session subject is user id
- OAuth token `sub` is user id
- old `single-operator` passkey store migrates

### Phase 2 — User-aware permission resolution

- Add identity lookup API on auth service.
- Resolve active user role before permission-rule fallback.
- Add suspended-user denial behavior.
- Add tests for `anchor`, `trusted`, `public`, fallback, and suspended users.

Validation:

- a known trusted user receives trusted tools only
- unknown callers still use `brain.yaml` rules
- suspended users are denied authentication/session use rather than downgraded to public

### Phase 3 — MCP per-session permissions

- Carry verified bearer identity through HTTP MCP auth.
- Create per-session MCP servers with user-specific permission level.
- Keep static token fallback as anchor.

Validation:

- trusted OAuth user cannot call anchor-only tools
- anchor OAuth user can call anchor tools
- static token behavior remains backward compatible

### Phase 4 — Management tools and CLI

- Add anchor-only user tools.
- Add CLI wrappers.
- Add attach/detach identity flows.
- Add passkey registration for a specific user through an anchor-generated, short-lived setup URL.

Validation:

- anchor can create trusted user
- trusted user cannot manage users
- identity attach enables login/permission mapping

### Phase 5 — Attribution

- Extend `ToolContext`, conversation metadata, message metadata, and job metadata with actor fields.
- Update interfaces to pass actor where known.
- Add read-side helpers for audit display.

Validation:

- MCP OAuth conversations/messages include user id
- Discord conversations map to user id when identity is linked
- jobs created by tools carry requested-by user metadata

### Phase 6 — Optional invitations/onboarding

Only build if real operator workflows need it. This phase adds convenience on top of the v1 operator-managed foundation:

- invite token
- pending user status
- invited-user passkey setup
- email/Discord delivery hooks
- resend/expiry UX

## Security notes

- Auth-user records are runtime auth state and should use `0600` file permissions.
- Never store passkey private material; public credential keys stay in passkey store.
- Role changes and identity attach/detach require `anchor`.
- Suspended users are denied auth/session use.
- Role downgrades, suspension, and identity detach revoke that user's sessions and refresh tokens immediately.
- Identity binding must be explicit; do not auto-link two identities just because display names match.

## Non-goals for first slice

- Fine-grained RBAC
- hosted SaaS account system
- changing existing tool visibility policy during role plumbing
- public registration
- invitation emails
- sharing auth state through `brain-data`
- rewriting CMS auth

## Done when

1. Fresh setup creates a durable auth user instead of `single-operator`.
2. Existing single-operator installs migrate safely.
3. Permission resolution uses auth users before falling back to rules.
4. MCP OAuth sessions receive per-user permissions.
5. Operators can manage users through tools/CLI.
6. Conversations/jobs can be attributed to users.
7. Auth state remains outside `brain-data`.
