# Plan: Connected channels (extensible channel identity)

## Status

**Proposed.** The standalone interface-grant panel has been removed; raw no-account allowlists remain config-seeded and CLI-managed. This plan adds the person-centered browser flow for connecting a channel identity and makes channel types extensible instead of hardcoded.

## Goal

Let an Admin connect a channel identity (Email, Discord, Slack, Teams, WhatsApp, …) to a **person**, so that person's role governs their messages on that channel, and let invitation delivery use the same registered channel vocabulary. Adding a channel must be a matter of **installing its message interface**, with **zero auth-schema change and zero console change**.

## Problem

Today a channel identity reaches a person's permission level through two mechanisms, neither of which provides the intended browser workflow:

- **Standalone interface grants** (`interfacePrincipalGrants`) — a raw `interface:subject` allowlist with no person attached. Its browser panel is removed; persistence remains for config/CLI-managed no-account channels, but it is not person-centered.
- **`attachIdentity`** — attaches an identity to a person, but its `type` is a **locked DB CHECK enum**: `["passkey","discord","mcp","oauth","email","did","a2a"]`. Adding Slack requires editing that enum and shipping a migration. The enum also conflates **auth mechanisms** (passkey, oauth, did, a2a, mcp — proofs the auth service implements) with **channels** (Discord, Email, Slack — messaging surfaces owned by message interfaces). The console likewise hardcodes `type === "discord"`.

Everything downstream is **already generic**: permission resolution, interface-principal grants, and `resolveActorPrincipal` key on a free channel type plus subject. One plugin can also host several platform adapters: `interfaces/chat` currently owns Discord and Slack while its plugin id remains `chat`. A channel type therefore cannot be inferred from one plugin id or represented by one descriptor per plugin. The hardcoded chokepoints are the identity-type enum, the console UI, and invitation delivery's email/non-email branches.

## Source of truth

This plan owns channel-identity typing, the app-scoped **channel registry**, delivery-provider registration, and the console's connect-a-channel UX. Auth-DB schema/resolution mechanics belong to [auth-runtime-db.md](./auth-runtime-db.md); person/role product behavior belongs to [multi-user.md](./multi-user.md).

## Core decisions

1. **Every channel is a message interface.** _(Operator decision 2026-07-27, reaffirmed after implementation review; do not revise without operator sign-off.)_ A channel is an explicitly registered app-scoped type owned by exactly one message-interface plugin; only interfaces register channels. A multi-platform interface may own several channel types (`interfaces/chat` owns `discord` and `slack`), so channel type is independent from plugin id, and an interface may implement only the outbound half of the contract first — outbound-only is a legitimate message interface, not a service. The registry is the source of truth; auth schema and console code never enumerate channel names, and no service plugin registers a channel.
2. **`authIdentities.type` drops its DB CHECK enum and becomes validated free text.** A type is valid if it is a reserved auth/credential kind (`passkey`, `oauth`, `did`, `a2a`, `mcp`) or a registered channel type. `email` moves to the channel vocabulary while existing Email rows remain valid through registration and migration compatibility.
3. **Metadata and provider operations are separate registrations, both owned by the channel's interface.** Browser-safe channel descriptors describe labels and subject validation. A backend delivery provider is keyed by channel type, has dynamic availability, and performs a send — the outbound half of the interface contract. A static capability bit cannot prove credentials are configured or perform delivery, so availability stays a runtime call.
4. **Email is an outbound-first message interface.** The `interfaces/email` message-interface plugin owns the `email` channel: it registers the Email descriptor and, when its transport is configured, the Email delivery provider. Resend (or SES, or SMTP) is a configurable transport _inside_ that interface — the way discord.js is a transport inside the Discord interface — not a sibling top-level plugin; `@brains/email-resend` dissolves into it and `@brains/notifications` registers nothing, staying channel-agnostic dispatch. Invitation creation, dispatch, recovery, idempotency, and confirmation contain no `type === "email"` branch. Future inbound email lands inside the same interface as a completion, not a new integration. Phase 2c removed the interim Notifications/Email Resend ownership split.
5. **One interface may register multiple descriptors.** `interfaces/chat` registers separate `discord` and `slack` descriptors while retaining `chat` as its plugin id. Stable channel type, descriptor ownership, and provider ownership remain distinct concepts.
6. **The message-interface base tolerates outbound-only interfaces.** `MessageInterfacePlugin` must not require a listener/daemon or conversation ingestion; an interface that only implements send (email today) is first-class. Inbound machinery is added when a channel grows its inbound half.
7. **Connecting a channel is a per-person Admin action.** On a member's detail, an Admin attaches a channel identity to that person via the existing `attachIdentity` mutation; the person's role then governs channel messages. Admin-attached channel identities are operator-asserted and authoritative for role resolution.
8. **Lookup subjects stay hashed; deliverable subjects stay private.** Identity lookup continues through `normalizeIdentityKey`/`hashIdentityKey`. When restart-safe delivery requires the actual destination, it may remain only on the private person claim as `delivery_subject`; it is never duplicated into invitation/outbox rows, audit, logs, model context, or public responses.
9. **Automatic and manual delivery are explicit modes.** Automatic mode requires a registered, currently available provider and fails before account creation when absent. Manual mode is never an implicit fallback: it is allowed only when the descriptor declares support, creates a `pending` invitation, exposes the single-use link only in the authorized Admin response, and requires a separate idempotent, audited confirmation before the setup claim becomes valid.
10. **Self-service channel connect is out of scope here.** A person cryptographically proving their own channel (OAuth-style) is a later assurance upgrade; this plan delivers the Admin-attached path that the removed panel was approximating.

## Data model

`authIdentities.type`: replace the Drizzle `enum` CHECK with plain `text`. Add an application-level validator, `assertValidIdentityType(type, registeredChannelTypes)`, called on every write path (`attachIdentity`, invitation creation, seeding, and migration import if any remains). Existing rows (`discord`, `email`, …) survive unchanged. The migration relaxes the constraint; it does not rewrite subjects or type values.

Reserved auth/credential kinds live in one exported auth-service constant. Channel kinds come only from the finalized app-scoped registry.

## Channel descriptor and delivery-provider contracts

Any message interface may contribute one or more serializable descriptors during app registration:

```ts
interface ChannelDescriptor {
  type: string; // "email", "discord", "slack"
  displayName: string;
  subjectLabel: string;
  subjectPattern?: { source: string; flags?: string };
  manualDelivery?: boolean;
}
```

`subjectPattern` is data, not a `RegExp` object, so the shell can expose it to the Admin browser. The server compiles and enforces it independently; client validation is advisory. Headless/machine integrations omit descriptors and are not offered as connectable channels.

Automatic delivery is a separate backend-only registration:

```ts
interface ChannelDeliveryProvider {
  channelType: string;
  isAvailable(): Promise<boolean>;
  send(input: {
    recipient: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<
    | { status: "sent"; providerDeliveryId?: string }
    | { status: "failed"; failureCode: string }
  >;
}
```

Only one active provider may own a channel type. Registration order is finalized before provider preflight or outbox recovery begins. `isAvailable()` reflects runtime configuration, not merely installed code. Every send receives the durable invitation-attempt id as its idempotency key and returns provider acceptance truth without recipient or secret content in errors.

`@brains/email` registers the Email descriptor and, when its Resend transport is configured, the Email provider. `@brains/notifications` remains channel-agnostic. Discord/Slack interfaces register their descriptors and may register providers when they can privately message a subject. Auth-service consults the registry by channel type and never imports channel- or transport-specific contracts.

For manual mode, `manualDelivery` only advertises that an Admin may deliberately carry the link out-of-band. Link creation does not write `setup_token_deliveries`. A separate confirmed mutation records recipient-hash confirmation, transitions the attempt/invitation according to the invitation state machine, and appends a content-free audit event.

## Resolution

No storage-policy change. A channel message from `channelType:subject` resolves through `resolveActorPrincipal`: the hashed subject looks up its `authIdentities` row → person → the person's permission level. Interface adapters must pass the registered channel type rather than assuming their plugin id; this preserves separate Discord and Slack identities behind `interfaces/chat`. The end-to-end test (channel identity attached to a Trusted member ⇒ that channel user resolves as Trusted) is the acceptance bar for the UI phase.

## Phased implementation

Thin vertical slices; tests fold into each phase.

### Phase 1 — Unlock: channel type off the enum

**Status: implemented.**

- Drop the CHECK enum on `authIdentities.type`; add `assertValidIdentityType` validated against reserved kinds ∪ finalized registered channel types.
- Add the migration and regression tests proving registered `email`, `discord`, and `slack` types survive while an unknown/unregistered type fails closed.
- No user-facing change. This is the extensibility unlock.

### Phase 2 — Contract: channel metadata and providers

**Status: implemented.**

- Add plural channel-descriptor registration to the app-scoped plugin context; plugins contribute descriptors before registration finalization.
- Add backend-only delivery-provider registration with one owner per channel type, dynamic availability, idempotent send input, and provider acceptance/failure output.
- `interfaces/chat` registers separate Discord and Slack descriptors, proving descriptors are not tied one-to-one to plugin ids.
- Start invitation outbox recovery only after registry finalization. Temporary provider unavailability leaves recoverable work queued; it never fabricates a failed or sent result.
- Tests cover duplicate registration, serializable metadata, configured/unconfigured provider availability, provider dispatch/idempotency propagation, and omission of plugins without descriptors.

### Phase 2b — Email becomes registered, not special

**Status: implemented, as an interim state.** Registration ownership here violates decision 1 (service plugins registering a channel) and is restructured by Phase 2c; the registry-driven auth-service side is final.

- `@brains/notifications` registers the built-in Email descriptor.
- Configured `@brains/email-resend` registers the Email delivery provider; unconfigured Resend leaves automatic delivery unavailable.
- Auth-service invitation dispatch resolves the provider from the registry; the Email-specific capability callback and every `type === "email"` branch in invitation code are deleted.
- Tests cover configured and unconfigured provider availability, idempotency-key propagation, failure truth, and manual mode without fabricated sends.

### Phase 2c — Email becomes an interface

**Status: implemented.** Email-channel ownership now belongs to a message interface per decisions 1, 4, and 6; auth-service and the registry contracts remain channel-agnostic.

- [x] Create the `interfaces/email` message-interface plugin: it owns the `email` channel, registering the Email descriptor and — only when its transport is configured — the Email delivery provider.
- [x] Move the Resend send path out of `@brains/email-resend` into the interface as its first configurable transport; retire the standalone package. `@brains/notifications` keeps dispatching operator notifications but registers no channels.
- [x] Relax `MessageInterfacePlugin` so an outbound-only interface needs no listener/daemon or conversation ingestion.
- [x] Reject channel registration from non-message-interface plugins once email has moved, closing decision 1's invariant in code.
- [x] Cover transport-unconfigured availability and end-to-end invitation email through the interface-registered provider; unavailable automatic delivery never fabricates a send and explicit manual mode remains available.

### Phase 3 — UI: connect a channel (registry-driven)

**Status: in progress.** Admin invitation choices and connected-channel presentation now come from the runtime registry. The attach/detach control remains.

- On `PersonDetail`, add a **Connect a channel** control to the read-only "Connected channels" section: pick from registered channel descriptors, enter the channel subject (validated against the serialized pattern), and submit `attachIdentity` through the existing confirmation/feedback pattern. No channel strings are hardcoded in the console.
- Re-add the client `attachIdentity` call in `api.ts`/`queries.ts` if it was removed with the deleted `IdentityDialog`.
- **Acceptance:** end-to-end test — attach a channel identity to a trusted member, assert a message from that channel subject resolves to the member as `trusted`; detach/suspend revokes it; audit records `auth.identity.attached`.

### Phase 4 — Prove extensibility

**Status: descriptor registration implemented; behavioral acceptance remains.**

- Slack, via `interfaces/chat`, declares its descriptor and becomes connectable alongside the same plugin's Discord descriptor.
- **Acceptance:** Slack becomes a fully working connectable channel with **zero auth-schema change and zero console change** — only the Slack interface adopting the contract. This is the definition of "properly extensible."

## Security notes

- Channel lookup keys are hashed at rest. A raw deliverable destination may persist only on its private person claim, never in invitation attempts, audit metadata, logs, model context, public cards, or broad roster projections.
- Admin-asserted channel identities are authoritative for role resolution: an Admin attaching a channel ID vouches for it. This is deliberate and audited; the trust boundary is the Admin, as with every other person mutation.
- Type validation is fail-closed: an identity whose type is neither a reserved credential kind nor a finalized registered channel is rejected on write, so an uninstalled or misspelled channel cannot create a dangling grant.
- Provider availability is checked outside the auth transaction immediately before automatic creation. A later outage produces provider failure truth; it never falls back silently to manual delivery.
- Manual confirmation requires an active Admin, same-origin explicit confirmation, a still-current unconsumed token, and a content-free audit event. Resend or cancellation invalidates an unconfirmed link.

## Out of scope

- **Self-service channel proof.** A person connecting their own channel via a verifiable flow (OAuth handshake, challenge message) — a later assurance upgrade over operator-asserted attach.
- **The standalone raw-ID grant surface.** Removed, not migrated; see [auth-runtime-db.md](./auth-runtime-db.md). Config + `brain auth reinitialize-access` remains the ops path for no-person channel allowlists.

## Related plans

- [auth-runtime-db.md](./auth-runtime-db.md) — auth DB foundation, identity schema, resolution, standalone-grant removal.
- [multi-user.md](./multi-user.md) — person/role product model and console UX.
