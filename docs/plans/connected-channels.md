# Plan: Connected channels (extensible channel identity)

## Status

**Proposed.** The standalone interface-grant panel has been removed; raw no-account allowlists remain config-seeded and CLI-managed. This plan adds the person-centered browser flow for connecting a channel identity and makes channel types extensible instead of hardcoded.

## Goal

Let an Admin connect a messaging-channel identity (Discord, Slack, Teams, WhatsApp, …) to a **person**, so that person's role governs their messages on that channel — and make adding a new channel a matter of **installing its interface**, with **zero auth-schema change and zero console change**.

## Problem

Today a channel identity reaches a person's permission level through two mechanisms, neither of which provides the intended browser workflow:

- **Standalone interface grants** (`interfacePrincipalGrants`) — a raw `interface:subject` allowlist with no person attached. Its browser panel is removed; persistence remains for config/CLI-managed no-account channels, but it is not person-centered.
- **`attachIdentity`** — attaches an identity to a person, but its `type` is a **locked DB CHECK enum**: `["passkey","discord","mcp","oauth","email","did","a2a"]`. Adding Slack requires editing that enum and shipping a migration. The enum also conflates **auth mechanisms** (passkey, oauth, did, a2a, mcp — proofs the auth service implements) with **channels** (discord, email — messaging surfaces that are really interfaces). The console likewise hardcodes `type === "discord"`.

Everything downstream is **already generic**: an interface's type is its plugin id (a free string, e.g. `interfaceType: "discord"`), and permission resolution, interface-principal grants, and `resolveActorPrincipal` all key on `interfaceType:subject` with no enum. The only hardcoded chokepoints are the identity-type enum and the console UI.

## Source of truth

This plan owns channel-identity typing, the interface **channel-descriptor** contract, and the console's connect-a-channel UX. Auth-DB schema/resolution mechanics belong to [auth-runtime-db.md](./auth-runtime-db.md); person/role product behavior belongs to [multi-user.md](./multi-user.md).

## Core decisions

1. **A connectable channel is a registered message interface.** The interface registry is the source of truth for channel types. The schema and the console must never enumerate channels.
2. **`authIdentities.type` drops its DB CHECK enum and becomes validated free text.** A `type` is valid if it is a **reserved auth/credential kind** (`passkey`, `oauth`, `did`, `a2a`, `mcp`, `email` — owned by auth-service) **or** a **registered message-interface `interfaceType`**. Installing an interface makes its channel a valid identity type with no migration.
3. **Interfaces own their channel metadata.** A message interface optionally declares a `channelDescriptor` — `{ displayName, subjectLabel, subjectPattern? }`. The auth service and console stay ignorant of any channel's ID format; the interface owns it.
4. **Connecting a channel is a per-person Admin action.** On a member's detail, an Admin attaches a channel identity to that person via the existing `attachIdentity` mutation; the person's role then governs channel messages. Admin-attached channel identities are **operator-asserted** and authoritative for role resolution.
5. **Subjects stay hashed at rest.** Channel identities reuse the existing `normalizeIdentityKey`/`hashIdentityKey` path — raw channel IDs are never stored, matching current identity handling.
6. **Self-service channel connect is out of scope here.** A person cryptographically proving their own channel (OAuth-style) is a later assurance upgrade, noted below; this plan delivers the operator-attached path that the removed panel was badly approximating.

## Data model

`authIdentities.type`: replace the Drizzle `enum` CHECK with plain `text`. Add an application-level validator, `assertValidIdentityType(type, registeredInterfaceTypes)`, called on every write path (`attachIdentity`, seeding, migration import if any remains). Existing rows (`discord`, `email`, …) stay valid. No data migration of existing rows; the migration only relaxes the constraint.

Reserved auth/credential kinds live in one exported constant in auth-service. Channel kinds are supplied at runtime from the interface registry.

## Interface channel-descriptor contract

Extend the message-interface plugin base (`shell/plugins` `MessageInterfacePlugin`) with an optional:

```
channelDescriptor?: {
  displayName: string;      // "Slack"
  subjectLabel: string;     // "Slack member ID"
  subjectPattern?: RegExp;  // optional client + server validation
}
```

Interfaces that represent a human-facing channel set it; interfaces that don't (headless/machine) omit it and are not offered as connectable channels. The shell exposes the registered channel descriptors to the auth service (for type validation) and the console (for the connect form).

## Resolution

No change. A channel message from `interfaceType:subject` already resolves through `resolveActorPrincipal`: the hashed subject looks up its `authIdentities` row → person → the person's `permissionLevel`. The end-to-end test (channel identity attached to a trusted member ⇒ that channel user resolves as trusted) is the acceptance bar for the UI phase.

## Phased implementation

Thin vertical slices; tests fold into each phase.

### Phase 1 — Unlock: channel type off the enum

- Drop the CHECK enum on `authIdentities.type`; add `assertValidIdentityType` validated against reserved kinds ∪ registered interface types.
- Migration relaxing the constraint; regression test that a non-reserved registered type (`discord`) still validates and an unregistered/unknown type is rejected.
- No user-facing change. This is the extensibility unlock.

### Phase 2 — Contract: interface channel-descriptor

- Add `channelDescriptor` to the message-interface base; wire the registry so the shell can enumerate channel descriptors.
- Discord adopts it (`displayName: "Discord"`, `subjectLabel: "Discord user ID"`). Proves the contract with the one channel that already exists.
- Tests: registry surfaces Discord's descriptor; an interface without a descriptor is absent from the channel list.

### Phase 3 — UI: connect a channel (registry-driven)

- On `PersonDetail`, add a **Connect a channel** control to the read-only "Connected channels" section: pick from installed channel interfaces (from the registry), enter the channel subject (validated by the descriptor's `subjectPattern`), submit `attachIdentity` through the existing confirmation/feedback pattern. No channel strings hardcoded in the console.
- Re-add the client `attachIdentity` call in `api.ts`/`queries.ts` if it was removed with the deleted `IdentityDialog`.
- **Acceptance:** end-to-end test — attach a channel identity to a trusted member, assert a message from that channel subject resolves to the member as `trusted`; detach/suspend revokes it; audit records `auth.identity.attached`.

### Phase 4 — Prove extensibility

- A second channel (Slack, via `interfaces/chat`) declares its `channelDescriptor` and becomes connectable.
- **Acceptance:** Slack becomes a fully working connectable channel with **zero auth-schema change and zero console change** — only the Slack interface adopting the contract. This is the definition of "properly extensible."

## Security notes

- Channel subjects are hashed at rest; raw IDs never persist and never appear in labels, responses, or audit metadata.
- Operator-asserted channel identities are authoritative for role resolution — an Admin attaching a channel ID vouches for it. This is deliberate and audited; the trust boundary is the Admin, same as every other person mutation.
- Type validation is fail-closed: an identity whose `type` is neither a reserved kind nor a registered interface is rejected on write, so an uninstalled/misspelled channel cannot create a dangling grant.

## Out of scope

- **Self-service channel proof.** A person connecting their own channel via a verifiable flow (OAuth handshake, challenge message) — a later assurance upgrade over operator-asserted attach.
- **The standalone raw-ID grant surface.** Removed, not migrated; see [auth-runtime-db.md](./auth-runtime-db.md). Config + `brain auth reinitialize-access` remains the ops path for no-person channel allowlists.

## Related plans

- [auth-runtime-db.md](./auth-runtime-db.md) — auth DB foundation, identity schema, resolution, standalone-grant removal.
- [multi-user.md](./multi-user.md) — person/role product model and console UX.
