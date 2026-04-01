# A2A Authentication & Permission Elevation

## Status: Draft

## Problem

When a remote agent calls our A2A endpoint, we need to determine its permission level (public, trusted, anchor). Currently all A2A callers get `public` permissions, which limits them to read-only tools.

Trusted agents should be able to trigger content generation, publishing, and other privileged operations — but only if we can verify their identity.

## Current State

- A2A interface serves on port 3334
- All incoming `message/send` requests use `userPermissionLevel: "public"`
- Existing `PermissionService` supports pattern matching: `a2a:*.rizom.ai` → `trusted`
- The infrastructure is ready — we just need to securely identify the caller

## Threat Model

A malicious agent could:

1. Claim to be `https://yeehaa.io` via a header or metadata field
2. We fetch their Agent Card from that URL — it exists (it's a real agent)
3. We grant trusted access based on the domain
4. **But the caller isn't actually that agent** — they just know the URL

This is a classic impersonation attack. The Agent Card fetch only proves the URL hosts an agent, not that the HTTP request came from that agent's server.

## Options

### Option A: Bearer Token (Simple, Secure)

Each trusted agent pair shares a pre-configured secret token.

```
Authorization: Bearer <shared-secret>
```

**Config:**

```ts
// In brain definition — maps token → agent identity (O(1) lookup on every request)
a2a: {
  port: 3334,
  trustedTokens: {
    "secret-token-123": "mylittlephoney",
    "secret-token-456": "relay",
  }
}
```

**Flow:**

1. Caller sends `Authorization: Bearer secret-token-123`
2. We look up the token → identity `"mylittlephoney"`
3. `permissions.getUserLevel("a2a", "mylittlephoney")` → `"trusted"`

**Pros:**

- Simple to implement (30 minutes)
- Cryptographically sound — possession of secret proves identity
- Works today with no spec changes

**Cons:**

- Manual token exchange between agent operators
- Doesn't scale to many agents (each needs a unique token)
- Tokens must be rotated manually

### Option B: Mutual Agent Card Verification with Callback

The caller identifies itself, and we verify by calling back.

**Flow:**

1. Caller sends request with `X-Agent-URL: https://mylittlephoney.com`
2. We generate a random challenge nonce
3. We POST a verification challenge to `https://mylittlephoney.com/a2a`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "a2a/verify",
     "params": {
       "challenge": "random-nonce-abc",
       "respondTo": "https://yeehaa.io"
     }
   }
   ```
4. If they respond with the correct nonce, they own that domain
5. We cache the verification for a TTL (e.g., 1 hour)
6. Extract domain → `permissions.getUserLevel("a2a", "mylittlephoney.com")`

**Pros:**

- No pre-shared secrets needed
- Domain-based — scales to any number of agents
- Uses the A2A protocol itself for verification
- Cacheable — don't verify on every request

**Cons:**

- Adds latency on first request (callback round-trip)
- Both agents must be publicly reachable (no localhost dev)
- Custom extension to A2A spec (`a2a/verify` method)
- More complex implementation

### Option C: Signed Requests (JWS/JWT)

The caller signs the request body with a private key. The public key is published in their Agent Card.

**Flow:**

1. Agent Card includes a `publicKey` or `jwks` field
2. Caller signs each request with their private key
3. We fetch their Agent Card, get the public key, verify the signature
4. If valid, the caller provably owns that Agent Card

**Pros:**

- Strongest identity guarantee
- No callback needed
- Standard cryptographic approach (JWS)

**Cons:**

- Key management complexity for agent operators
- Need to handle key rotation
- Agent Card schema extension needed
- Most complex implementation

### Option D: OAuth 2.0 Client Credentials

Use standard OAuth 2.0 with a shared authorization server.

**Pros:**

- Industry standard
- Token rotation, scoping, revocation built in

**Cons:**

- Requires an authorization server
- Overkill for agent-to-agent in a small network
- Adds external dependency

## A2A Spec Alignment

The A2A spec already defines auth via `securitySchemes` and `security` fields on the Agent Card, following the OpenAPI pattern. All phases below map to spec-defined schemes — no custom extensions needed.

| Phase                            | A2A scheme                | Standard |
| -------------------------------- | ------------------------- | -------- |
| 1 — Bearer tokens                | `HTTPAuthSecurityScheme`  | RFC 6750 |
| 2 — OAuth 2.0 Client Credentials | `OAuth2SecurityScheme`    | RFC 6749 |
| 3 — Cloudflare mTLS              | `MutualTlsSecurityScheme` | RFC 8705 |

Option B (callback verification) is dropped — it was reinventing OAuth.

## Recommendation

**Phase 1: Bearer Token (Option A)**

- Ship now, works today
- Sufficient for a small network of known agents (rover ↔ mylittlephoney ↔ relay)
- ~30 minutes to implement
- Agent Card declares `HTTPAuthSecurityScheme` with `scheme: "bearer"`

**Phase 2: OAuth 2.0 Client Credentials (Option D, scoped down)**

- Automated token exchange — removes manual token sharing
- One brain acts as OAuth server (simple Hono endpoint), the other exchanges credentials for a bearer token
- Layer 1 (token resolution) stays the same — OAuth just automates provisioning
- Pro: infrastructure-independent, works anywhere including localhost
- Con: need to implement a minimal OAuth token endpoint

**Phase 3: Cloudflare mTLS**

- Zero-token auth at the network layer for production
- Cloudflare handles certificate management — create client certs in dashboard, add Access policy
- Auth happens during TLS handshake before HTTP request reaches your code
- Pro: no tokens, no rotation, no application code
- Con: tied to Cloudflare, can't work for localhost dev
- Bearer tokens remain as fallback for local dev and non-Cloudflare agents

**Future: OpenID Connect**

- Only if third-party agents from other organizations need to call your brains
- Adds identity federation via a shared identity provider

**Note:** Each phase is additive. The auth resolution layer accepts any valid credential — bearer tokens never go away, they're always the local dev fallback.

## Implementation Plan (Phase 1)

### 1. Config Schema Update

```ts
const a2aConfigSchema = z.object({
  port: z.number().default(3334),
  domain: z.string().optional(),
  organization: z.string().optional(),
  // Map of bearer token → agent identity (token is the key for O(1) lookup)
  trustedTokens: z.record(z.string()).optional(),
  // Outbound tokens: map of remote agent domain → token to send
  outboundTokens: z.record(z.string()).optional(),
});
```

### 2. Inbound: Caller Resolution in A2A Interface

```ts
import { timingSafeEqual } from "crypto";

function resolveCallerIdentity(
  authHeader: string | undefined,
  trustedTokens: Record<string, string>,
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Direct lookup: token → identity (O(1))
  const identity = trustedTokens[token];
  return identity ?? null;
}
```

**Note:** Token comparison uses direct map lookup (constant time by key). For additional hardening, consider hashing tokens before storing them as keys (so raw tokens aren't held in memory).

### 3. Permission Lookup

```ts
const callerId = resolveCallerIdentity(authHeader, config.trustedTokens);
const permissionLevel = callerId
  ? context.permissions.getUserLevel("a2a", callerId)
  : "public";
```

### 4. Pass to Handler

```ts
// JsonRpcHandlerContext gains callerPermissionLevel
const response = await handleJsonRpc(parsed.data, {
  taskManager: this.taskManager,
  agentService: this.agentService,
  callerPermissionLevel: permissionLevel,
});
```

### 5. Outbound: Client Sends Auth Token

The `a2a_call` tool must send tokens when calling trusted remote agents.

```ts
// In createA2ACallTool deps:
export interface A2AClientDeps {
  fetch?: FetchFn;
  outboundTokens?: Record<string, string>; // domain → token
}

// In sendMessage:
const token = outboundTokens?.[agentDomain];
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}
```

### 6. Agent Card Advertises Auth

The A2A spec's `AgentCard` already supports `securitySchemes` and `security` fields. Populate them so remote agents know auth is available.

```ts
// In buildAgentCard, when trustedTokens is configured:
securitySchemes: {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
  },
},
security: [{ bearerAuth: [] }],
```

This tells callers: "I accept Bearer tokens. Send one if you have it, or you'll get public access."

### 7. Instance Configuration (brain.yaml)

Auth and permissions are instance-specific — they belong in `brain.yaml`, not the brain model code. Secrets are referenced via `${ENV_VAR}` interpolation, actual values stay in `.env`.

```yaml
brain: rover
domain: yeehaa.io

plugins:
  a2a:
    organization: rizom.ai
    # Inbound: tokens remote agents send us (token → identity)
    trustedTokens:
      ${A2A_TOKEN_MLP}: mylittlephoney
      ${A2A_TOKEN_RELAY}: relay
    # Outbound: tokens we send to remote agents (domain → token)
    outboundTokens:
      mylittlephoney.com: ${A2A_OUTBOUND_TOKEN_MLP}
      relay.rizom.ai: ${A2A_OUTBOUND_TOKEN_RELAY}

permissions:
  anchors:
    - cli:*
    - mcp:stdio
  rules:
    - pattern: "a2a:mylittlephoney"
      level: trusted
    - pattern: "a2a:relay"
      level: trusted
    - pattern: "a2a:*"
      level: public
    - pattern: "mcp:http"
      level: public
```

And in `.env`:

```
A2A_TOKEN_MLP=secret-token-abc
A2A_TOKEN_RELAY=secret-token-def
A2A_OUTBOUND_TOKEN_MLP=secret-token-ghi
A2A_OUTBOUND_TOKEN_RELAY=secret-token-jkl
```

**Prerequisites:**

- Replace hand-rolled yaml parser in `instance-overrides.ts` with `fromYaml` from `@brains/utils`
- Add env var interpolation (`${VAR}` → `process.env.VAR`)
- Support nested maps and list-of-objects in plugin overrides
- Support `permissions.rules` as list of `{ pattern, level }` objects

## Open Questions

1. ~~Should tokens be per-agent or per-permission-level?~~ **Per-agent** — each agent gets its own token, PermissionService maps identity to level.
2. ~~Should we support bidirectional token exchange?~~ **Yes** — inbound (`trustedTokens`) and outbound (`outboundTokens`) are separate configs since each side generates its own token.
3. How does the A2A spec plan to handle authentication? Monitor spec evolution — the `securitySchemes` field on `AgentCard` suggests they're heading toward OpenAPI-style auth declarations.
4. ~~Should token values come from env vars or config?~~ **Env vars** — referenced in yaml via `${VAR}`, actual values in `.env`.
5. ~~Auth vs permissions in the same place?~~ **No** — auth (trustedTokens) proves identity, permissions (rules) grant access. Always separate concerns.

## Files Changed (Phase 1)

### Already done ✅

- `interfaces/a2a/src/config.ts` — `trustedTokens` and `outboundTokens` in schema
- `interfaces/a2a/src/a2a-interface.ts` — resolve caller identity from auth header, pass permission level
- `interfaces/a2a/src/jsonrpc-handler.ts` — accept and use `callerPermissionLevel`
- `interfaces/a2a/src/client.ts` — send outbound auth token in `sendMessage`

### Remaining

- `shell/app/src/instance-overrides.ts` — replace hand-rolled parser with `fromYaml` + env interpolation
- `shell/app/src/brain-resolver.ts` — apply permissions from yaml overrides
- `interfaces/a2a/src/agent-card.ts` — populate `securitySchemes`/`security` when auth is configured
- Instance yaml files — add A2A tokens + permission rules
- `.env` files — add `A2A_TOKEN_*` vars
