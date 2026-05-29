# @brains/atproto

AT Protocol integration for Rizom brains.

This package currently covers the Phase 1 foundation plus the first outbound publishing slice:

- `ServicePlugin` package skeleton
- initial `ai.rizom.brain.card` and `ai.rizom.brain.post` lexicons
- `did:web` document route at `/.well-known/did.json` when configured
- app-password PDS client wrapper for mocked authentication, record creation, and blob upload tests
- brain card publishing as `ai.rizom.brain.card`
- blog `post` entity projection to `ai.rizom.brain.post`
- optional Bluesky summary cross-post as `app.bsky.feed.post`

## Configuration

In a brain model or preset:

```ts
atprotoPlugin({
  pdsEndpoint: "https://bsky.social",
  identifier: "example.com",
  repoDid: "did:plc:...",
  brainDid: "did:web:example.com",
  anchorDid: "did:plc:...",
  appPasswordEnv: "ATPROTO_APP_PASSWORD",
});
```

In an instance `brain.yaml`, non-secret values belong under the plugin id:

```yaml
plugins:
  atproto:
    pdsEndpoint: https://bsky.social
    identifier: example.com
    repoDid: did:plc:...
    brainDid: did:web:example.com
    anchorDid: did:plc:...
    appPasswordEnv: ATPROTO_APP_PASSWORD
```

And the secret goes in the instance environment:

```bash
ATPROTO_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

Secrets should be supplied through environment variables or app secret configuration, not committed content.

### Config fields

- `pdsEndpoint`: PDS service endpoint. Defaults to `https://bsky.social`.
- `identifier`: PDS login identifier, usually a handle or account DID.
- `repoDid`: optional DID of the PDS repo to write records into. If omitted, the DID from `createSession` is used.
- `brainDid`: optional public brain DID. If this is `did:web:*`, the plugin exposes `/.well-known/did.json`.
- `anchorDid`: optional human/operator DID included in custom records.
- `appPassword`: direct app password for local development only.
- `appPasswordEnv`: environment variable containing the app password. Prefer this over `appPassword`.

## Tools

### `atproto_validate_credentials`

Checks whether the configured identifier/app-password can create a PDS session. It does not publish records.

Input:

```json
{}
```

### `atproto_publish_card`

Publishes this brain's capability card to the configured PDS as `ai.rizom.brain.card`.

Input:

```json
{ "dryRun": true }
```

Use `dryRun: true` to inspect the record without writing to the PDS.

### `atproto_publish_post`

Publishes an existing local blog `post` entity as `ai.rizom.brain.post`.

Input:

```json
{
  "entityId": "post-123",
  "dryRun": true,
  "topics": ["protocols"],
  "crossPostToBluesky": true
}
```

Notes:

- The local `post` entity remains the source of truth.
- Private posts are refused.
- `crossPostToBluesky` also writes an `app.bsky.feed.post` summary with an external embed.

## Manual smoke checklist

Use a test PDS/Bluesky account and an app password.

1. Configure `identifier`, `repoDid` or handle, `brainDid`, and `appPasswordEnv`.
2. Start a brain with the atproto plugin enabled.
3. Confirm DID document if using `did:web`:
   - `GET https://<brain-domain>/.well-known/did.json`
4. Dry-run card publishing:
   - `atproto_publish_card { "dryRun": true }`
5. Validate credentials:
   - `atproto_validate_credentials {}`
6. Publish card:
   - `atproto_publish_card { "dryRun": false }`
7. Dry-run a public blog post:
   - `atproto_publish_post { "entityId": "<post-id>", "dryRun": true }`
8. Publish the post record:
   - `atproto_publish_post { "entityId": "<post-id>", "dryRun": false }`
9. Optionally cross-post to Bluesky:
   - `atproto_publish_post { "entityId": "<post-id>", "crossPostToBluesky": true }`
10. Verify records in the PDS repo.
11. Verify the Bluesky post appears when cross-posting is enabled.

## Current limitations

- OAuth is deferred; the prototype uses app-password authentication.
- Lexicon TypeScript generation is not wired into the workspace yet. Until then, lexicon JSON is checked by tests, and record mapper tests validate the important projections against existing entity schemas.
- Post cover images are uploaded as AT Protocol blobs and included in `ai.rizom.brain.post` records.
- Bluesky cross-posts currently support text, length truncation, and external embeds; facets and image embeds are still future work.
