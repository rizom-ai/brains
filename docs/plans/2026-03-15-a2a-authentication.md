# Plan: A2A Authentication Follow-on

## Open work

Remaining work is limited to follow-on auth options and docs cleanup around the current bearer-token model.

### 1. Decide whether stronger auth is worth adding

Current follow-on candidates:

- OAuth client-credentials style auth
- mTLS / Cloudflare-backed origin authentication

This should only move forward if bearer tokens prove insufficient in real operator use.

### 2. Keep config/docs aligned with the current token flow

Examples and bootstrap docs should continue to reflect the current model:

- `trustedTokens`
- `outboundTokens`
- permission rules for trusted A2A callers
- Agent Card bearer-auth advertisement

### 3. Remove dead alternative-design text when it stops helping

Older callback-verification ideas should not keep hanging around as if they are pending roadmap items.

## Non-goals

- replacing the existing bearer-token model as the default
- inventing a second auth layer without operator demand
- mixing authentication and permission policy into one mechanism

## Done when

1. docs/examples consistently describe the current bearer-token model
2. we either choose and scope a stronger auth follow-on, or explicitly decide bearer tokens are enough for now
