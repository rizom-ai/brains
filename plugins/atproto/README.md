# @brains/atproto

AT Protocol integration for Rizom brains.

Current scope is the Phase 1 foundation from `docs/plans/atproto-integration.md`:

- `ServicePlugin` package skeleton
- initial `ai.rizom.brain.card` and `ai.rizom.brain.post` lexicons
- `did:web` document route at `/.well-known/did.json` when configured
- app-password PDS client wrapper for mocked authentication, record creation, and blob upload tests

## Configuration

```ts
atprotoPlugin({
  pdsEndpoint: "https://bsky.social",
  identifier: "example.com",
  repoDid: "did:plc:...",
  brainDid: "did:web:example.com",
  appPasswordEnv: "ATPROTO_APP_PASSWORD",
});
```

Secrets should be supplied through environment variables or app secret configuration, not committed content.
