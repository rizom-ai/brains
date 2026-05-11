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

A2A traffic between brains is authenticated by per-brain Ed25519 signing keys, with public keys discoverable via `/.well-known/jwks.json`. Every A2A request is signed using RFC 9421. Operators express trust by listing peer domains, not by exchanging secrets. The verified caller domain flows into the existing `permissionService` (anchor / trusted / public) unchanged.

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

The `keyid` parameter resolves to a JWKS URL at the same domain. Verified domain is the identity. Operators trust peers by listing domains in `trustedAgents: Record<domain, identity>`. No identifier scheme is invented; the brain's existing `context.domain` is the identity, consistent with how the Agent Card already advertises the brain.

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
- `verifyRequest(req, jwksResolver) → { keyId, domain } | error`
- `JwksResolver` — TTL-cached fetcher of remote brains' JWKS

Used by `interfaces/a2a` (both inbound and outbound). The keypair lifecycle (generate / persist / load) lives in the same package or in `shell/auth-service` alongside existing auth key custody.

### 6. Trust-establishment via the existing agent-directory flow

The a2a interface already uses a "discovered → approved" lifecycle for peer agents (see the agent-call instruction block in `interfaces/a2a/src/a2a-interface.ts`, around the `target agent is discovered but not approved yet` rule). This plan plugs into that flow:

- Adding a peer fetches `/.well-known/agent-card.json` and `/.well-known/jwks.json`, marks the entry "discovered"
- Approving a peer adds an entry to `trustedAgents` with the desired permission level

No secret is exchanged. The `outboundTokens` config field is removed.

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
  const verified = await verifyRequest(req, this.jwks);
  if (!verified) return "public";
  const identity = this.config.trustedAgents?.[verified.domain];
  if (!identity || !this.permissionContext) return "public";
  return this.permissionContext.getUserLevel("a2a", identity);
}
```

The shape of the function and the downstream `getUserLevel` call are unchanged. Only the input changes: from a bearer token to a verified domain.

### Config schema change

`interfaces/a2a/src/config.ts`:

```ts
// before
trustedTokens: z.record(z.string()).optional(),  // token → identity
outboundTokens: z.record(z.string()).optional(), // domain → token

// after
trustedAgents: z.record(z.string()).optional(),  // domain → identity
```

There is no migration shim. The current bearer-token path is removed in the same change. Operators with existing `trustedTokens` config get a clear startup error and a migration note.

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

### Phase 4 — inbound verification

- swap `resolveCallerPermission` to verify-and-resolve
- add `trustedAgents` config field, remove `trustedTokens`
- update agent-card / agent-discovery flows to fetch and store peer JWKS at approval time

### Phase 5 — docs and migration

- update operator docs and example configs
- document reverse-proxy requirements
- delete `2026-03-15-a2a-authentication.md`

## Open questions

1. Package home: `shared/http-signatures` (cross-cutting library) or `shell/http-signatures` (brain-runtime infrastructure)? Leaning shared since it's a small standalone library with no brain-specific dependencies.
2. Do we want to support multi-key rollover on a single peer? `JwksResolver` already handles it via JWKS publishing both old and new keys; verifier just needs to try matching on `kid`.
3. Should `JwksResolver` be a singleton at the brain level (one cache for all peer lookups) or per-A2A-interface? Singleton is simpler and matches expected usage.
4. Do we sign A2A streaming responses (SSE events from `/a2a` POST that opens a stream), or only the initiating request? V1 signs the request only — streaming response signing is a separate question.
5. Does the agent directory need a "key fingerprint at approval time" field for trust-on-first-use semantics? Probably yes — if a peer's JWKS suddenly returns a different key, that should require re-approval. Worth adding to the agent entity schema.

## Verification

1. A brain generates a signing keypair on first boot and publishes it at `/.well-known/jwks.json`
2. Outbound A2A requests carry `Signature` and `Signature-Input` headers per RFC 9421; no `Authorization: Bearer` header is sent
3. Inbound A2A requests verify successfully when the sender's JWKS is reachable and the signature is valid; fail with 401 otherwise
4. `trustedAgents: Record<domain, identity>` resolves to the same `permissionService.getUserLevel(...)` flow that `trustedTokens` did
5. Two brains can establish bidirectional A2A trust without exchanging any secret
6. Key rotation (replacing a brain's signing key) does not require re-approval at peers, as long as the new key is published in JWKS during a grace window
7. Freshness window rejects requests outside ±60s
8. `outboundTokens` and `trustedTokens` are removed from the config schema; brains with old config get a clear startup error
9. Old `2026-03-15-a2a-authentication.md` is deleted; references in other plans updated

## Related

- `shell/auth-service` — existing OAuth/JWKS foundation that this plan extends
- `docs/plans/cms-heavy-backend.md` — sequenced after this plan
- `docs/plans/multi-user.md` — depends on this plan for cross-interface identity
- `entities/agent-discovery` — saved-agent allowlist semantics this plan plugs into
