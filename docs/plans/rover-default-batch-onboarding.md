# Rover default batch onboarding

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running `rover:default` instead of `rover:core`, while keeping the rollout safe, customizable, reversible, and clear for operators and users.

## Context

The first pilot batch used the core-oriented flow. `rover:default` adds the website and publishing surface, including site-building, browser/CMS expectations, and more background AI work. The existing ops tooling can already resolve cohort-level `presetOverride: default`, but the onboarding flow should be tightened before adding a larger batch.

The second batch is expected to need per-user visual customization. Users do not edit generated `brain.yaml`; operators capture customization in desired-state user files, then `brains-ops` renders the effective `brain.yaml`.

For now, custom site and theme packages may be required to be public npm packages. Private package registry/auth support is explicitly out of scope for this batch.

## Phase 1 — Must-have before onboarding

### 1. Public npm package site/theme overrides

Add optional user-level site override fields:

```yaml
# users/<handle>.yaml
site:
  package: "@scope/rover-site"
  theme: "@scope/rover-theme"
```

Behavior:

- site/theme choices are per-user identity and branding choices, not batch/cohort rollout controls
- cohorts must not define site/theme overrides
- no user/cohort merge behavior is needed for site/theme
- `site.package` and `site.theme` are rendered into generated `users/<handle>/brain.yaml` when present
- refs must be npm package refs that can be installed by the deploy build without private registry credentials
- if a package ref changes while the brain version stays the same, the fleet image must still rebuild and redeploy affected users

Update `packages/brains-ops`:

- `src/schema.ts`
- `src/load-registry.ts`
- `src/default-user-runner.ts`
- `src/render-users-table.ts` if we want site/theme columns or a compact customization indicator
- registry/reconcile/render tests
- operator and user docs

Update deploy support outside `packages/brains-ops`:

- `shared/deploy-support` Dockerfile rendering so fleet images can install the selected public npm site/theme packages in addition to `@rizom/brain@$BRAIN_VERSION`
- `packages/brains-ops` generated env/deploy metadata so image identity includes the effective package set, not just `brainVersion`
- GitHub build workflow/template so changes to user site/theme refs trigger a build and affected deploys

Suggested image identity:

```text
brain-${brainVersion}-pkg-${packageSetHash}
```

The package-set hash should be derived from the unique package refs used by the deployed users. A simpler first step is acceptable if it reliably rebuilds whenever refs change.

Out of scope for this batch:

- private npm packages
- per-user registry credentials
- arbitrary user editing of generated `brain.yaml`

### 2. Per-user custom domain support

Add optional user-level domain fields:

```yaml
# users/<handle>.yaml
domainOverride: custom.example.com
previewDomainOverride: custom-preview.example.com # optional
```

Update:

- `packages/brains-ops/src/schema.ts`
- `packages/brains-ops/src/load-registry.ts`
- `packages/brains-ops/src/default-user-runner.ts`
- `packages/brains-ops/templates/rover-pilot/deploy/scripts/resolve-user-config.ts`
- registry, reconcile, and deploy config tests
- operator docs and checklist

Behavior:

- default remains `<handle><domainSuffix>`
- `domainOverride` replaces the primary domain for that user
- `previewDomainOverride` replaces deploy's derived preview domain when provided
- if the custom domain is outside the configured Cloudflare zone/cert coverage, docs should flag that manual DNS/cert work may be required

### 3. Add `user:add --no-discord`

Add CLI support:

```sh
bunx brains-ops user:add . alice --cohort batch-2 --no-discord
```

Update:

- `packages/brains-ops/src/run-command.ts`
- `packages/brains-ops/src/user-add.ts`
- CLI/user-add tests
- onboarding docs

Behavior:

- keep Discord enabled by default for backward compatibility
- `--no-discord` writes:

```yaml
discord:
  enabled: false
```

### 4. Default-preset verification checklist

Update the operator checklist for `rover:default` deployments:

- `GET /health` returns `200`
- `GET /` loads the browser/site surface with the selected site/theme package
- `GET /cms` loads the CMS/login surface
- unauthenticated `POST /mcp` returns the expected auth failure
- initial site build completes
- content repo exists and syncs
- passkey setup/handoff is completed
- background jobs are not repeatedly failing, except for expected missing optional integrations

## Phase 2 — Safer rollout flow

### 5. Document a one-user canary procedure

Recommended flow:

```text
create batch-2 cohort with presetOverride: default
choose public npm site/theme package refs
add one canary user
encrypt secrets
onboard canary
verify web/CMS/site/theme/sync/auth
then add remaining users
```

Include rollback notes:

- remove the user from the default cohort, or set the cohort back to `core`
- remove or change site/theme overrides if the package fails
- reconcile generated outputs
- rebuild/redeploy the affected user image/config

### 6. Brain-initiated setup email when Discord is disabled

For `rover:default`, browser/CMS setup may be the primary onboarding path, so first-passkey setup must not depend on Discord, SSH, container logs, or operator-side setup URL retrieval.

Use a brain-initiated email flow: the running Rover generates the existing one-shot setup URL and sends it directly to the user's verified setup email.

Add optional user-level setup delivery metadata:

```yaml
# users/<handle>.yaml
setup:
  delivery: email
  email: user@example.com
```

Runtime behavior:

1. Rover boots.
2. `auth-service` sees no passkey exists and generates the existing one-shot setup URL.
3. `auth-service` checks its own persistent "setup email sent" record. If already sent for the current setup token, it skips delivery.
4. Otherwise `auth-service` calls the generic notifications layer with a recipient and a typed channel preference (today: `email`).
5. The notifications layer routes the message to the matching transport adapter (today: Resend) over a channel-specific contract (`email:send`).
6. On confirmed delivery, `auth-service` records the send so normal restarts do not re-spam users.
7. The user registers their passkey; setup closes; the record is invalidated when the setup token rotates.

Architecture: three layers, audience-agnostic

- `@brains/notifications` (generic routing) — owns recipient/channel modelling, picks the transport adapter, plumbs `sensitivity` through. Knows nothing about who the recipient is (operator, user, anchor, team member).
- `@brains/email-contracts` + transport adapters (`email-resend`, future `email-local-mailserver`, ...) — own the wire format and provider integration.
- Consumers (today: `auth-service`) — own audience semantics, the _reason_ a notification is sent, and one-shot/dedupe state tied to that reason.

Operator-only concepts (which identity gets the email, why, when not to resend) live in the consumer, not in the notifications layer. The notifications layer must not grow operator-specific defaults; a future `user-notifications` consumer should sit alongside `auth-service` at the same layer, both calling the same generic `notifications:send`.

Fleet/deploy configuration should target the generic transport layer, not a one-off provider integration:

```env
SETUP_EMAIL_PROVIDER=resend # first adapter; exact provider TBD
SETUP_EMAIL_API_KEY=...
SETUP_EMAIL_FROM=Rover <setup@rizom.ai>
```

Consumers call the routing layer with a recipient + channel preference:

```ts
notifications.send({
  recipient: { type: "email", address: "user@example.com" },
  title: "Set up your brain passkey",
  body: "...",
  sensitivity: "secret",
});
```

The routing layer dispatches to the channel-specific transport contract (e.g. `email:send`). Future channels (matrix DM, push) plug in as additional `recipient.type` variants and additional transport adapters without touching consumers.

This leaves room for a future full email server inside the brain: setup email becomes the same consumer with a different transport adapter, for example `provider: local-mailserver`.

Update `packages/brains-ops`:

- add `setup.email` and `setup.delivery` to user schema
- render the effective setup delivery config into generated `brain.yaml` or another runtime config path
- include non-secret setup status in operator docs/views if useful, but never include the setup URL

Update runtime/plugin support:

- ship a generic `@brains/notifications` routing layer that depends only on channel-specific transport contracts, never on a specific provider
- ship at least one transport adapter (`@brains/email-resend`) behind the email contract
- `auth-service` calls the routing layer; it must not import a provider package directly
- `auth-service` owns the one-shot/dedupe state for setup email, persisted alongside its other runtime state (same `storageDir`), keyed to the active setup token so the record invalidates when the token rotates
- the notifications layer itself stays stateless; it does no audience-level dedupe
- store any delivery state in runtime storage, not the content repo or generated views
- expose a safe resend path later if needed

Security rules:

- treat the setup URL as a secret bearer capability
- send only after the public HTTPS domain is valid enough for user registration
- do not store setup URLs in git, generated views, artifacts, checked-in docs, public channels, or hosted logs
- user-facing email must state that the link is single-use and expires
- delivery failure logs must not include the setup URL

Non-goals for this batch:

- operator scraping setup URLs from logs
- SSH-based setup retrieval
- pre-generating setup tokens in ops
- private user-selected delivery providers
- implementing the full in-brain email server now

Design constraints:

- do not couple setup email directly to a specific third-party provider; keep a provider adapter boundary so a later in-brain mail server can replace the transport without changing auth-service setup semantics
- the notifications routing layer must remain audience-agnostic; do not bake operator/user/anchor semantics into it. Audience-specific policy (who to send to, when not to resend) lives in the calling consumer

Later enhancement:

```sh
bunx brains-ops setup:resend . <handle>
```

This can request a resend or rotate/reissue setup if the original email expired.

## Phase 3 — Nice-to-have tooling

### 7. Add `brains-ops preflight`

Potential command:

```sh
bunx brains-ops preflight . --cohort batch-2
```

Checks:

- registry loads
- cohort exists
- users resolve to expected preset/version/domain/site/theme
- site/theme package refs are public-installable or at least syntactically valid package refs
- encrypted secrets exist
- generated config is present, or shows what would be generated
- custom domain and preview domain assumptions are visible
- warns if Discord is enabled without obvious bot-token staging
- warns if default-preset users are missing browser/passkey handoff notes

### 8. Better package authoring docs/templates

Document minimal package contracts:

- theme package exports a CSS string as default export
- site package exports a valid `SitePackage`
- packages must be compatible with the pinned `@rizom/brain` public API
- packages must be public npm packages for this batch

Optionally add starter templates for:

- `rover-theme-*`
- `rover-site-*`

## Suggested implementation order

1. Public npm site/theme package overrides and deploy image installation
2. Custom domains
3. `--no-discord`
4. Brain-initiated setup email delivery
5. Docs/checklist/canary/passkey updates
6. Run tests/build
7. Onboard one `rover:default` canary with a custom public npm theme
8. Add `preflight` after batch 2 if still useful
