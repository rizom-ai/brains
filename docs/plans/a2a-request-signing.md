# Plan: A2A Request Signing

## Status

Proposed. A2A-specific auth hardening that builds on the existing `shell/auth-service` JWKS/auth foundation. Supersedes the prior `2026-03-15-a2a-authentication.md` follow-on, which left the question "is stronger auth worth adding" open.

## Context

A2A inbound auth today uses a static map of bearer tokens to identities (`interfaces/a2a/src/config.ts:14`):

```ts
trustedTokens: z.record(z.string()).optional(),  // token → identity
outboundTokens: z.record(z.string()).optional(), // domain → token
```

Two operators wanting their brains to talk requires generating a shared secret out-of-band, copying it into both brains' config, and re-doing the dance on rotation. There is no revocation, no audit, and the secret-as-identity model means a leaked token is full impersonation.

Brain-to-brain is the right shape for cryptographic identity: each brain runs at a domain, can publish a JWKS, and can sign its own requests. RFC 9421 (HTTP Message Signatures) is a published RFC with library support and is the foundation that AAuth and similar agent-auth proposals build on. Adopting it now solves the immediate brittleness without committing to the rest of any draft protocol stack.

## Goal

A2A traffic between brains is authenticated by per-brain Ed25519 signing keys, with public keys discoverable via `/.well-known/jwks.json`. Every A2A request is signed using RFC 9421. Connecting a peer adds it to the local agent directory for outbound use; inbound trust is a separate explicit grant stored in runtime auth storage, with no secrets exchanged. The verified caller domain resolves to public by default, or to the explicitly granted trusted level when a pinned peer-trust record matches.

## Non-goals

- Adopting full AAuth (Person Server, missions, AAuth-Requirement first-call ceremony, `aauth:local@domain` identifier scheme). This plan ships the foundation only — RFC 9421 plus per-instance keys plus JWKS — which is what AAuth itself sits on top of.
- Replacing the existing OAuth/passkey provider for human/MCP auth.
- Changing the permission model. The anchor / trusted / public levels in `permissionService` remain authoritative; this plan only changes what feeds into the identity column.
- Replay protection beyond a freshness window. A nonce store may be added later; the freshness window is the v1 bound.
- Supporting reverse proxies that mutate covered headers. Operators must run with proxies that preserve `Host`, `Date`, and request body integrity. Documented as a constraint, not a feature.

## Architectural decisions

### 1. RFC 9421 with Ed25519, covering minimal canonical components

Each brain holds one signing keypair (Ed25519). Outbound A2A requests sign:

- `@method`
- `@target-uri`
- `host`
- `date`
- `content-digest` (SHA-256 of body)
- `created` (signature parameter, freshness)

This covers everything that matters for request integrity without depending on headers a proxy might rewrite.

### 2. Identity is the brain's domain

The `keyid` parameter resolves to a JWKS URL at the same domain. Verified domain is the identity. Connected peers are directory contacts for outbound calls; trusted inbound access requires a separate runtime peer-trust grant (decision 6). There is no domain-list config field. No identifier scheme is invented; the brain's existing `context.domain` is the identity, consistent with how the Agent Card already advertises the brain.

### 3. Separate keypair from the auth-service signing key

`shell/auth-service` already has its own keypair for issuing JWTs. This plan introduces a second keypair for signing A2A requests. Both are published via the same `/.well-known/jwks.json` endpoint, distinguished by `use`:

- `use: sig`, `alg: ES256` — auth-service JWT key
- `use: sig`, `alg: EdDSA` — A2A signing key

Separating the keys keeps blast radius contained: rotating the OAuth signing key does not invalidate A2A peer relationships, and vice versa.

### 4. Library choice

- `http-message-signatures` (npm) for sign / verify
- `jose` for JWKS parsing and key import (already in use by `shell/auth-service`)

If the available library does not cover Ed25519 + the chosen covered components cleanly, fall back to a small in-package implementation against the canonical-components algorithm. Verified scope is small enough to own.

### 5. Package home

A new shared package at `shared/http-signatures` or `shell/http-signatures`. Owns:

- `signRequest(req, privateKey, keyId)`
- `verifyRequest(req, jwksResolver) → { keyId, domain } | null` — null when
  no signature is present; throws when a signature is present but invalid
- `JwksResolver` — TTL-cached fetcher of remote brains' JWKS

Used by `interfaces/a2a` (both inbound and outbound). The keypair lifecycle (generate / persist / load) lives in the same package or in `shell/auth-service` alongside existing auth key custody.

### 6. Directory connection is separate from inbound trust

The a2a interface already uses a "discovered → approved" lifecycle for peer agents (see the agent-call instruction block in `interfaces/a2a/src/a2a-interface.ts`, around the `target agent is discovered but not approved yet` rule). That lifecycle governs the **directory and outbound calling** only: connecting or approving a peer means "this is a saved contact I may call", not "this peer may use my trusted surface inbound".

Inbound trust uses a separate **peer-trust record** `{domain, key fingerprint, grantedLevel}` in runtime auth storage:

- Adding a peer (`agent_connect` or ATProto discovery) fetches `/.well-known/agent-card.json` and saves/updates the directory entry. It does **not** create an inbound trusted grant.
- A separate explicit trust action (`agent_set_trust_level`) fetches `/.well-known/jwks.json`, pins the peer A2A key fingerprint, and writes the peer-trust record.
- `grantedLevel` is `trusted` or `public`; `anchor` is not grantable to a peer brain — owner authority stays human.

The peer-trust record — not the entity — is what inbound verification consults. This split is deliberate: agent entities are git-synced brain-data, and directory-sync ingests that repo automatically, so an entity-borne grant would let anyone with a commit to the content repo mint themselves inbound trust (add an approved entry for their own domain, sign with their own key). Trust grants therefore live on the runtime plane (same non-synced storage class as passkeys and sessions; table shape coordinates with [auth-runtime-db.md](./auth-runtime-db.md)), where only explicit runtime trust flows write. A restored brain-data repo brings back the directory _listing_; inbound trust requires a separate runtime grant.

No secret is exchanged anywhere, and no domain-list config field replaces the removed tokens.

### 7. Task access is bound to the verified caller

Today `tasks/get` and `tasks/cancel`
(`interfaces/a2a/src/jsonrpc-handler.ts`) accept any caller who knows a
task UUID: tasks are not associated with the identity that created
them, so a public caller with a leaked ID can read a task's full
history — including responses produced under a trusted caller's
permission level — or cancel it. Once decision 2 gives every request a
verified domain, bind tasks to it:

- `TaskRecord` gains `callerDomain: string | null` (null for
  public/unverified callers), set at creation in the `message/send` and
  `message/stream` paths.
- `tasks/get` and `tasks/cancel` return `-32001` (task not found)
  unless the requesting verified domain matches the record's
  `callerDomain`. Deliberately "not found", not "forbidden" — task IDs
  must not be probeable.
- Tasks created by unverified callers are readable only by unverified
  callers of the same session scope; if no session notion exists for
  public callers, they are simply not readable back (the response
  already streamed inline).

### 8. Retries are limited to requests that never reached the peer

`isRetryableNetworkError` in `interfaces/a2a/src/client.ts` currently
treats every `Error` as retryable, so a mid-stream idle timeout —
which fires _after_ the remote accepted and began processing — re-POSTs
the same `message/stream` request and produces a duplicate agent turn
on the peer. Fix in two layers:

- Client: retry only connection-establishment failures (DNS, refused,
  TLS, reset-before-response). Once any response byte or SSE event has
  arrived, no automatic retry.
- Protocol: outbound `message/send` / `message/stream` carry a client
  idempotency key (`messageId` already exists in the A2A message
  envelope — reuse it); the receiving handler tracks recently seen
  message IDs per verified caller (TTL ~10 min, bounded) and returns
  the existing task instead of starting a duplicate turn. Signed
  requests make the key trustworthy; that is why this lands here and
  not as a standalone patch.

## Design

### Outbound signing

In `interfaces/a2a/src/client.ts` (the bearer is set at `headers["Authorization"] = Bearer ${authToken}`; `outboundTokens` is resolved in the surrounding caller), replace the bearer header write with:

```ts
await signRequest(request, agentKey.privateKey, agentKey.keyId);
```

…and drop the `outboundTokens` lookup that supplies `authToken`. `agentKey.keyId` is a stable string of the form `https://<own-domain>/.well-known/jwks.json#<kid>`, allowing the receiver to resolve the JWKS via the keyid without inventing a separate discovery mechanism.

### Inbound verification

In `interfaces/a2a/src/a2a-interface.ts`, the existing `resolveCallerPermission(authHeader)` (currently reads `authHeader` and looks up `trustedTokens`) becomes:

```ts
private async resolveCallerPermission(req: Request): Promise<UserPermissionLevel> {
  const verified = await verifyRequest(req, this.jwks); // absent → null, invalid → throws
  if (!verified) return "public";
  const grant = await this.peerTrust.get(verified.domain); // runtime auth storage
  if (!grant || grant.keyFingerprint !== verified.keyFingerprint) return "public";
  return grant.grantedLevel; // "trusted" | "public"
}
```

The function's shape is unchanged; the inputs change from a bearer token to a verified domain, and the lookup moves from config to the runtime peer-trust store. A fingerprint mismatch (peer's keys changed with no rotation overlap) resolves to `public` and flags the directory entry back to "discovered" for re-approval — the caller keeps the public surface rather than being rejected, because the _signature_ was valid; only the pinned trust is stale.

Absent and invalid signatures are different cases and must not be conflated:

- **No signature at all** → the caller is anonymous and resolves to `"public"`. Two brains that have never heard of each other keep talking with zero setup; signing only upgrades identity, it is not an admission ticket.
- **Signature present but invalid** (bad digest, expired freshness window, unresolvable `keyid`, key mismatch) → reject with 401. A failed verification is a forgery attempt or a broken proxy, never silently downgraded to public — downgrading would let an attacker probe with someone else's identity and still get the public surface while masking the failure from both operators.

`verifyRequest` therefore distinguishes "no `Signature` header" (returns null) from "verification failed" (throws), and the handler maps the throw to 401.

### Config schema change

`interfaces/a2a/src/config.ts`:

```ts
// before
trustedTokens: z.record(z.string()).optional(),  // token → identity
outboundTokens: z.record(z.string()).optional(), // domain → token

// after — nothing. Trust is not config.
```

Both fields are removed with no replacement: outbound needs no credential (requests are signed), and inbound grants live in the runtime peer-trust store written by explicit trust actions. There is no migration shim. Operators with existing `trustedTokens`/`outboundTokens` config get a clear startup error and a migration note: connect peers for outbound calls, then explicitly grant inbound trust only where intended.

### JWKS resolver

`JwksResolver` fetches `https://<peer-domain>/.well-known/jwks.json` on first contact, caches with TTL (default 1 hour), respects `Cache-Control` headers if present. On verification failure due to unknown `kid`, refetches once before failing — this handles peer key rotation gracefully.

### Freshness and clock skew

Verifier rejects signatures with `created` outside `±60s` of current time. This is the bound; replay within 60s is accepted. Document this clearly. Adding a nonce store later narrows the window if operators report concerns.

### Reverse-proxy compatibility

Document required proxy behavior:

- preserve `Host` header (or set `X-Forwarded-Host` and configure verification to check both)
- do not modify request body
- forward `Signature` and `Signature-Input` headers verbatim

Caddy, nginx, and Traefik do this by default. Cloudflare's body-rewriting features (image resizing, etc.) break signatures and must be off for `/a2a`.

## Rollout

### Phase 1 — keypair lifecycle

- module that generates an Ed25519 keypair on first run, persists in the brain's data dir, reloads thereafter
- exposes the public key for inclusion in `/.well-known/jwks.json`
- coordinates with `shell/auth-service`'s existing JWKS endpoint

### Phase 2 — signing library

- create `shared/http-signatures` (or `shell/http-signatures`)
- implement `signRequest`, `verifyRequest`, `JwksResolver`
- unit tests covering the signed-component canonicalization, content-digest, freshness window, and `kid` resolution

### Phase 3 — outbound signing

- integrate `signRequest` into `interfaces/a2a/src/client.ts`
- add `agentKey` injection through `InterfacePluginContext` so the client can sign without owning the key directly
- remove `outboundTokens` config field

### Phase 4 — inbound verification and the peer-trust store

- add the peer-trust store (`{domain, keyFingerprint, grantedLevel}`) in runtime auth storage, written only by an explicit trust-grant flow, with a fingerprint-mismatch path that drops the caller to `public`
- swap `resolveCallerPermission` to verify-and-resolve against the store; remove `trustedTokens`
- add `agent_set_trust_level`, an explicit trust-grant/revoke flow that fetches peer JWKS for `trusted` and records the pinned grant, or revokes the grant for `public`
- test that `agent_connect`, `system_update({ status: "approved" })`, and content-plane sync grant nothing inbound by themselves

### Phase 5 — task caller binding and idempotent retry

- add `callerDomain` to `TaskRecord`, set from the verified identity;
  gate `tasks/get`/`tasks/cancel` on it (decision 7), with tests for
  cross-caller probing returning `-32001`
- narrow client retry to connection-establishment failures; add the
  `messageId`-based dedupe store on the receiving side (decision 8),
  with a test that a retried send resolves to the same task

### Phase 6 — docs and migration

- update operator docs and example configs
- document reverse-proxy requirements
- delete `2026-03-15-a2a-authentication.md`

## Resolved questions

Settled in [identity-and-trust.md](./identity-and-trust.md):

1. Package home is `shared/http-signatures` — a small standalone library with no brain-specific dependencies.
2. Multi-key rollover on a single peer is supported: peers publish old and new keys in JWKS during a grace window; the verifier matches on `kid`.
3. `JwksResolver` is a brain-level singleton (one cache for all peer lookups).
4. V1 signs the initiating request only. Signing A2A streaming responses (SSE events) is a separate future question.
5. Key fingerprint pinning at explicit trust-grant time (trust-on-first-use) is in scope: if a peer's JWKS returns entirely different keys with no rotation overlap, inbound calls from that peer drop back to `public` and require a renewed trust grant. The fingerprint lives in the runtime peer-trust record beside the granted level (decision 6), not on the git-synced agent entity — the entity only mirrors the discovered/approved status for directory UX.

## Verification

1. A brain generates a signing keypair on first boot and publishes it at `/.well-known/jwks.json`
2. Outbound A2A requests carry `Signature` and `Signature-Input` headers per RFC 9421; no `Authorization: Bearer` header is sent
3. Inbound A2A requests verify successfully when the sender's JWKS is reachable and the signature is valid; a request with a present-but-invalid signature fails with 401; a request with no signature resolves to the public permission level (unacquainted brains keep talking with zero setup)
4. Connecting or approving a peer in the directory is not sufficient for inbound trust: valid signed requests from connected peers still resolve to `public` until an explicit runtime peer-trust grant exists
5. Two brains can establish bidirectional A2A trust without exchanging any secret, but each side must explicitly grant inbound trust where desired
6. Key rotation (replacing a brain's signing key) does not require re-approval at peers, as long as the new key is published in JWKS during a grace window
7. Freshness window rejects requests outside ±60s
8. `outboundTokens` and `trustedTokens` are removed from the config schema with no replacement field; brains with old config get a clear startup error
9. An `approved` agent entity arriving via content sync (directory-sync from the brain-data repo) grants no inbound permission — only a runtime peer-trust record does
10. A task created by verified peer A cannot be read or cancelled by peer B or by an unverified caller (`-32001`, indistinguishable from a missing task)
11. Re-sending a `message/send` with the same `messageId` from the same verified caller within the dedupe window returns the original task; the peer runs one agent turn, not two
12. Old `2026-03-15-a2a-authentication.md` is deleted; references in other plans updated

## Related

- [identity-and-trust.md](./identity-and-trust.md) — the positioning doc this plan executes a slice of; settles domain-as-identity, key custody, and the shared trust-establishment flow
- [auth-runtime-db.md](./auth-runtime-db.md) — home of the runtime auth storage plane the peer-trust store joins
- `shell/auth-service` — existing OAuth/JWKS foundation that this plan extends
- `docs/plans/multi-user.md` — depends on this plan for cross-interface identity linking (a follow-on; multi-user phases 1–3 proceed independently)
- `entities/agent-discovery` — saved-agent allowlist semantics this plan plugs into
