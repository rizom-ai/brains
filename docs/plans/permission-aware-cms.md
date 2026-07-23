# Plan: Permission-aware CMS

## Status

**Proposed.** The first-party CMS remains Admin-only until every read, write, assist, upload, and workspace route enforces the caller's runtime principal. Do not expose the current direct entity APIs to Trusted sessions incrementally.

This plan is the CMS follow-up to [Multi-User & Permissions](./multi-user.md). It reuses the existing content visibility and entity action policy contracts; it does not introduce a CMS-specific role system. The separate Sveltia content-repository token flow remains Admin-only because a shared repository credential cannot enforce per-action runtime permissions.

## Goal

Let active Trusted users collaborate through the first-party CMS within the same policy boundaries used by system tools:

- reads are capped by the caller's content visibility scope;
- creates, updates, deletes, extraction, and publication obey the resolved entity action policy;
- every mutation is attributed to the authenticated user;
- workspaces receive and enforce the real caller rather than a synthetic Admin;
- the browser shows only capabilities the server has granted; and
- Admin-only and `never` operations remain inaccessible regardless of client behavior.

The target is coarse, policy-driven collaboration—not per-document ownership or full RBAC.

## Current baseline

`plugins/cms` currently uses a boolean `hasAdminAuthSession` gate for the shell and every private API route. That gate closed a real privilege escalation when multi-user sessions first landed, but it also prevents legitimate Trusted collaboration.

The Admin gate currently compensates for several route-level gaps:

- entity reads do not pass `visibilityScope` explicitly;
- create, update, and delete call the entity service directly without checking `context.permissions.assertEntityActionAllowed()`;
- CMS updates do not share the system tool's publish-boundary check;
- workspace reads receive no actor, while workspace actions receive hard-coded `operator` / `admin` data;
- upload promotion attributes work to a synthetic CMS service actor;
- assist and agent routes do not authorize against the target entity type;
- type, schema, count, agent, sync, and workspace discovery are not filtered for Trusted callers; and
- cookie-authenticated mutations do not yet share one explicit same-origin JSON/CSRF guard.

Useful foundations already exist:

- `AuthPrincipal.permissionLevel` and `ActorRef` provide verified caller identity;
- `permissionToVisibilityScope()` maps Public → public, Trusted → shared, and Admin → restricted;
- entity queries accept a visibility scope and fail closed to public when it is absent;
- `context.permissions.assertEntityActionAllowed()` exposes the central entity action policy to plugins;
- platform defaults require Admin for every entity action, while brain models can deliberately loosen selected entity types to Trusted;
- `canWriteVisibility()` prevents callers from writing above their readable scope; and
- the CMS already has stale-write protection through `baseContentHash`.

## Authorization model

### Surface admission

The first-party CMS is an authenticated authoring surface:

| Principal                 | CMS shell                              | CMS APIs         |
| ------------------------- | -------------------------------------- | ---------------- |
| Anonymous                 | Redirect to login                      | `401`            |
| Active Public user        | `403`                                  | `403`            |
| Active Trusted user       | Allowed after this plan's rollout gate | Permission-aware |
| Active Admin user         | Allowed                                | Permission-aware |
| Invited or suspended user | Denied                                 | Denied           |

Admin does not bypass an entity action configured as `never`.

### Read visibility

Every request resolves the active principal once and derives one server-owned visibility scope:

```text
public  -> public
trusted -> shared      (public + shared)
admin   -> restricted  (public + shared + restricted)
```

That scope must be passed to entity counts, lists, detail reads, attachment resolution, and any workspace provider that reads entities. An entity outside the caller's scope returns `404`, not a distinguishable permission oracle.

Type and schema discovery must not reveal restricted machinery merely because an entity plugin is registered. A type is visible when the caller can perform a relevant action on that type or the type has at least one entity visible in the caller's scope. Counts are always scoped. Schema requests use the same type-visibility decision.

### Entity actions

The existing resolved entity action policy is authoritative:

- create → `assertEntityActionAllowed(entityType, "create", caller)`;
- update → `assertEntityActionAllowed(entityType, "update", caller)`;
- delete → `assertEntityActionAllowed(entityType, "delete", caller)`;
- extraction/rebuild → `assertEntityActionAllowed(entityType, "extract", caller)`; and
- entering or remaining in a publish status → `assertEntityActionAllowed(entityType, "publish", caller)`.

The platform fallback remains Admin-only. A model such as the collective posture may opt specific collaborative types into Trusted create/update while retaining Admin delete/publish.

Authorization happens before expensive work and immediately before persistence. Client-supplied role, visibility scope, capability flags, user id, or confirmation state is never trusted.

### Visibility on writes

A caller may mutate only an entity they can already read. The resulting entity visibility must also be within the caller's scope:

- Trusted may create/update public or shared content;
- Trusted may not create, move, or rewrite restricted content;
- Admin may write through restricted scope; and
- no caller may use a frontmatter or adapter transform to smuggle a write above their scope.

Create and update validation must inspect the adapter-derived final entity, not only the incoming frontmatter.

### Publication transitions

CMS updates must use the same publish-status boundary semantics as `system_update`. Move the reusable publish-boundary classifier to a shared entity/plugin boundary rather than duplicating status logic in `plugins/cms`.

A Trusted user with `update: trusted` but `publish: admin` may edit a draft but cannot save a transition into a publish status or modify an already-published record while it remains in the publish set.

## Request principal and actor propagation

Replace the boolean session resolver with one request access object derived from `AuthPrincipal`:

```ts
interface CmsRequestAccess {
  principal: AuthPrincipal;
  actor: ActorRef; // { kind: "user", userId, canonicalId? }
  permissionLevel: "trusted" | "admin";
  visibilityScope: "shared" | "restricted";
  isAnchor: boolean;
}
```

Resolve it once per request. Suspended and missing users fail before route logic.

Extend entity mutation event context so CMS-created embedding/export jobs retain the initiating `ActorRef` and interface. Do not write private auth ids or identity claims into markdown/frontmatter. Git commit author configuration remains a directory-sync concern; this plan does not claim per-editor Git authorship.

Allowed and denied CMS mutations should produce structured, actor-attributed runtime audit events without logging content bodies, passkey/session data, or private channel subjects.

## Route policy

### Entity reads

- `types`: scoped counts and filtered type capabilities.
- `schema`: available only for a type visible to the caller.
- `entities` list/detail: pass the caller's visibility scope explicitly.
- content hashes remain available for optimistic concurrency only after read authorization.

### Entity mutations

- `POST entities`: create policy, final visibility cap, typed schema validation, actor attribution.
- `PUT entities`: visible existing entity, update or publish policy as appropriate, final visibility cap, stale hash, actor attribution.
- `DELETE entities`: visible existing entity, delete policy, explicit same-origin confirmation, actor attribution.
- Preserve entity adapters, validators, embedding jobs, export, and directory-sync as the single persistence pipeline.

### Assist and agent calls

Assist is not a write, but it consumes private content and model resources. It is available only when the caller can read the supplied entity and is allowed to update that entity type. Requests must identify the target entity, and the server reloads the visible entity instead of trusting an arbitrary full body as authorization context.

Agent discovery and `ask-agent` must not expose private agent topology to callers who cannot use the target assist operation. A suggestion never bypasses save-time update/publish checks.

### Uploads

The server resolves the upload handler's target entity type before promotion and enforces that type's create policy. The promotion handler receives the authenticated user `ActorRef`, not `{ kind: "service", serviceId: "cms-upload" }`. Temporary upload records are cleaned up on denied or failed promotion.

### Workspaces

The current workspace contract must become actor-aware:

- data providers receive `CmsWorkspaceActor` and filter their data;
- action handlers receive the real user id, `ActorRef`, permission level, visibility scope, and Anchor facet;
- workspace descriptors are returned only when the provider admits the caller; and
- each provider authorizes its own typed actions server-side.

Initial provider posture:

- Publishing: Trusted may inspect and arrange only policy-visible drafts; dispatch/retry/external publication requires publish permission.
- Site: preview actions may be Trusted only when their underlying entity policies permit them; production rebuild/deploy remains Admin.
- Directory Sync: operational status and manual sync remain Admin unless a narrower safe action is explicitly defined.

The CMS host must not invent one blanket workspace role or restore the hard-coded `operator` actor.

### Sync and operational metadata

Branch names, remotes, dirty-tree state, and manual sync controls are operational metadata. Keep them Admin-only. Trusted users may receive a minimal save state (for example, “saved” or “pending export”) that reveals no repository topology.

## Browser capability contract

The API returns server-derived capability data; the React client does not reconstruct permission policy:

```ts
interface CmsTypeCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExtract: boolean;
  canPublish: boolean;
  canAssist: boolean;
}
```

The UI uses capabilities to hide impossible navigation and disable unavailable actions with clear role-aware explanations. Server checks remain authoritative for forged requests, stale capabilities, role changes, and concurrent suspension.

Console registration changes from Admin visibility to Trusted visibility only at the final rollout gate. Public users do not receive a CMS door.

## HTTP and error behavior

- Resolve the principal from the authenticated session; never accept identity or role in request JSON.
- Require same-origin JSON and CSRF protection for every cookie-authenticated mutation.
- Return `401` for no active session, `403` for an authenticated principal below surface/action permission, `404` for an entity outside visibility scope, `409` for stale content, and `400` for malformed payloads.
- Use private `no-store` responses for principal/capability data.
- Keep route-level checks even if the shared HTTP route registry later centralizes minimum-level admission; handler checks own entity/action semantics.

## Non-goals

- Per-entity owners, ACLs, teams, or arbitrary RBAC.
- Giving Public users a CMS authoring surface.
- Synthesizing local member profile entities.
- Letting Trusted users receive a repository PAT or use Sveltia's shared-repository credential flow.
- Changing entity markdown schemas solely to store auth attribution.
- Replacing the entity service, adapters, directory-sync, or git export pipeline.
- Treating Anchor identity as authorization.
- Per-editor Git commit authorship in this slice.

## Implementation phases

### Phase 0 — Characterize and prove denial

1. Inventory every CMS shell/API route and each registered workspace provider.
2. Add an Admin/Trusted/Public/anonymous/suspended route matrix.
3. Add public/shared/restricted fixtures for list, detail, counts, schemas, assist, upload, and workspaces.
4. Preserve the current Admin gate while lower-level policy tests are introduced.

Gate: no Trusted request reaches current direct entity/workspace mutation code.

### Phase 1 — Principal-aware reads

1. Replace the boolean resolver with `CmsRequestAccess`.
2. Pass explicit visibility scope to counts, lists, details, and provider reads.
3. Filter type/schema discovery and return server-derived capabilities.
4. Return private `no-store` responses and consistent `401`/`403`/`404` status codes.

Gate: Trusted tests can read public/shared fixtures but cannot infer restricted entities, counts, schemas, or workspace data. The production surface remains Admin-only.

### Phase 2 — Shared write authorization

1. Enforce central create/update/delete policy on direct CMS mutations.
2. Enforce final-entity visibility with `canWriteVisibility()`.
3. Move publish-boundary classification to a shared package and enforce publish policy exactly as system tools do.
4. Add same-origin JSON/CSRF guards and explicit delete confirmation.
5. Preserve stale-write and adapter validation behavior.

Gate: a policy matrix proves model overrides, wildcard defaults, `never`, publish transitions, visibility escalation denial, and role changes between page load and mutation.

### Phase 3 — Actor attribution and uploads

1. Carry authenticated `ActorRef` and `interfaceType: "cms"` through entity mutation events and jobs.
2. Pass the user actor through upload promotion.
3. Append content-free structured audit events for allowed and denied mutations.
4. Verify no auth identifiers enter markdown or public entity metadata.

Gate: entity/job/audit fixtures identify the initiating user without raw provider subjects or synthetic operator/service actors.

### Phase 4 — Assist and workspace contracts

1. Bind assist/agent requests to a server-loaded visible entity and update permission.
2. Make workspace data providers and descriptors actor-aware.
3. Require every workspace provider to enforce typed actions with the real caller.
4. Separate Trusted-safe save progress from Admin-only repository diagnostics.
5. Add provider-specific tests for Publishing, Site, and Directory Sync.

Gate: no workspace or assist endpoint relies only on shell admission, and no provider receives a hard-coded Admin actor.

### Phase 5 — Permission-aware UI and atomic rollout

1. Render type/action/workspace controls from server capabilities.
2. Add role-aware denial and stale-capability feedback.
3. Change CMS endpoint/interaction visibility to Trusted.
4. Replace the outer Admin-only gate with minimum Trusted admission only after every API route and workspace passes the matrix.
5. Keep Sveltia/PAT routes Admin-only.

Gate: one live Trusted account can edit an explicitly Trusted-enabled shared draft, cannot see restricted content, delete an Admin-only entity, publish, sync, deploy, or call a forged API action; Admin behavior remains intact.

## Validation

Required checks include:

- focused CMS route and React tests;
- entity visibility and entity action policy suites;
- workspace provider tests in content-pipeline, site-builder, and directory-sync;
- auth-session tests for active, suspended, role-changed, and missing users;
- actor attribution checks for direct edits, uploads, jobs, and audit;
- repository typecheck, lint, and docs checks; and
- live Rover and collective-posture review with distinct Admin and Trusted passkeys.

## Done when

1. Trusted CMS access is enabled only through the single permission-aware route set.
2. Every read carries an explicit server-derived visibility scope.
3. Every write enforces central entity action, publish, visibility, and concurrency policy.
4. Every mutation and workspace action carries the authenticated `ActorRef`.
5. Workspace, assist, upload, and operational routes have explicit policy.
6. The UI reflects server capabilities without becoming an authorization source.
7. Restricted content and operational metadata do not leak through counts, schemas, errors, agents, or workspaces.
8. Sveltia's shared repository credential remains Admin-only.
