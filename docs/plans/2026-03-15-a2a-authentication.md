# A2A Authentication & Permission Elevation

## Context

This is no longer a pure draft. The bearer-token phase already shipped for the A2A interface.

Remote A2A callers no longer have to be treated as public-only when a trusted token is configured. The interface can now resolve caller identity from a bearer token and elevate permission level accordingly.

## What is already true

Shipped behavior:

- A2A config supports `trustedTokens` and `outboundTokens`
- inbound bearer token resolution exists in the A2A interface
- resolved caller permission level is passed through JSON-RPC handling
- outbound A2A client calls can attach configured bearer tokens
- Agent Card advertises bearer auth through `securitySchemes` / `security` when enabled
- instance override parsing supports the relevant nested A2A token maps

Core files:

- `interfaces/a2a/src/config.ts`
- `interfaces/a2a/src/a2a-interface.ts`
- `interfaces/a2a/src/jsonrpc-handler.ts`
- `interfaces/a2a/src/client.ts`
- `interfaces/a2a/src/agent-card.ts`

Tests exist for:

- outbound token sending
- caller permission resolution
- Agent Card auth advertisement
- instance-override parsing

## Current model

### Inbound auth

A trusted remote agent sends:

```http
Authorization: Bearer <shared-secret>
```

The A2A interface looks up that token in `trustedTokens`, resolves the configured identity, and asks the permission system for that caller's level.

### Outbound auth

For trusted remote agents, outbound calls can attach a token chosen by remote domain from `outboundTokens`.

### Agent Card

When trusted-token auth is configured, the Agent Card advertises bearer auth so remote agents know auth is available.

## Current recommended config shape

```yaml
plugins:
  a2a:
    trustedTokens:
      ${A2A_TOKEN_MLP}: mylittlephoney
      ${A2A_TOKEN_RELAY}: relay
    outboundTokens:
      mylittlephoney.com: ${A2A_OUTBOUND_TOKEN_MLP}
      relay.rizom.ai: ${A2A_OUTBOUND_TOKEN_RELAY}

permissions:
  rules:
    - pattern: "a2a:mylittlephoney"
      level: trusted
    - pattern: "a2a:relay"
      level: trusted
    - pattern: "a2a:*"
      level: public
```

## What remains

Only follow-on work remains.

### 1. Broader auth evolution

Bearer tokens are the shipped baseline. Future phases such as OAuth client credentials or Cloudflare mTLS remain optional enhancements, not missing prerequisites.

### 2. Config/docs rollout

Instance docs and examples should stay aligned with the current token-based flow, including `.env` naming and permission-rule examples.

### 3. Evaluate whether dead design text should survive

The old callback-verification idea is intentionally not part of the shipped direction. Keep the doc focused on the token-based phase unless there is concrete demand for another auth layer.

## Verification

This doc is accurate when all of these remain true:

1. `trustedTokens` and `outboundTokens` are live config fields.
2. inbound A2A bearer tokens can elevate permission level.
3. outbound A2A calls can send configured bearer tokens.
4. Agent Card advertises bearer auth when configured.
5. permission mapping still flows through the normal permission system.
