# @brains/atproto

AT Protocol integration for Rizom brains.

This package currently covers the Phase 1 foundation plus the first outbound publishing slice:

- `ServicePlugin` package skeleton
- `ai.rizom.brain.card` lexicon owned by the ATProto service plugin
- `did:web` document route at `/.well-known/did.json` when configured
- app-password PDS client wrapper for mocked authentication, record creation, and blob upload tests
- brain card publishing as `ai.rizom.brain.card`
- projection registry so entity plugins can register ATProto lexicons and mappers without centralizing entity records here

## Configuration

In a brain model or preset:

```ts
atprotoPlugin({
  pdsEndpoint: "https://bsky.social",
  identifier: "example.com",
  repoDid: "did:plc:...",
  brainDid: "did:web:example.com",
  anchorDid: "did:plc:...",
  appPassword: "${ATPROTO_APP_PASSWORD}",
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
    appPassword: ${ATPROTO_APP_PASSWORD}
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
- `appPassword`: app password value. In committed instance config, use the standard `${ENV_VAR}` interpolation form, e.g. `${ATPROTO_APP_PASSWORD}`.
- `appPasswordEnv`: legacy/alternate environment variable indirection. Prefer `appPassword: ${ATPROTO_APP_PASSWORD}` for normal brain instance config.

## Tools

### `atproto_validate_credentials`

Checks whether the configured identifier/app-password can create a PDS session. It does not publish records.

Input:

```json
{}
```

### `atproto_publish_card`

Upserts this brain's capability card to the configured PDS as `ai.rizom.brain.card` using rkey `self`.

Input:

```json
{ "dryRun": true }
```

Use `dryRun: true` to inspect the record without writing to the PDS.

### `atproto_publish_entity`

Publishes any public local entity that has registered an ATProto projection.

Input:

```json
{
  "entityType": "post",
  "entityId": "post-123",
  "dryRun": true,
  "topics": ["protocols"]
}
```

Use this for generic projection-backed publishing. The entity plugin owns the record mapper and collection name.

### `atproto_publish_post`

Convenience wrapper that publishes an existing local blog `post` entity as `ai.rizom.brain.post`.

Input:

```json
{
  "entityId": "post-123",
  "dryRun": true,
  "topics": ["protocols"]
}
```

Notes:

- The local `post` entity remains the source of truth.
- Private posts are refused.
- Successful publishes store the custom ATProto article URI in the blog post frontmatter as `atprotoUri`.
- This tool publishes the semantic article record only. Bluesky feed posts should be handled later through the `social-post` workflow.

## Projection registration

Entity plugins should own their own ATProto projection definitions and register them with the shared registry:

```ts
import {
  AtprotoProjectionRegistry,
  parseAtprotoLexicon,
} from "@brains/atproto-contracts";
import noteLexicon from "../lexicons/ai.rizom.brain.note.json";

AtprotoProjectionRegistry.getInstance().register({
  entityType: "note",
  collection: "ai.rizom.brain.note",
  lexicon: parseAtprotoLexicon(noteLexicon),
  validate: false,
  buildRecord: async ({ entity }) => ({
    $type: "ai.rizom.brain.note",
    body: entity.content,
    sourceEntityType: entity.entityType,
    sourceEntityId: entity.id,
    createdAt: entity.created,
  }),
});
```

The registry rejects collection/lexicon mismatches. The blog `post` projection is registered by `@brains/blog`; other entity packages should follow the same ownership pattern.

## Manual smoke checklist

Use a test PDS/Bluesky account and an app password.

1. Configure `identifier`, `repoDid` or handle, `brainDid`, and `appPassword: ${ATPROTO_APP_PASSWORD}`.
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
8. Optionally dry-run the same projection through the generic entity path:
   - `atproto_publish_entity { "entityType": "post", "entityId": "<post-id>", "dryRun": true }`
9. Publish the post record:
   - `atproto_publish_post { "entityId": "<post-id>", "dryRun": false }`
10. Verify records in the PDS repo.

## Current limitations

- Outbound ATProto OAuth is deferred; the prototype uses app-password authentication. This is separate from the brain's existing inbound OAuth server for clients calling the brain.
- Lexicon TypeScript generation is intentionally not wired into the workspace yet. For now, lexicon JSON is checked by tests, and record mapper tests validate the important projections against existing entity schemas.
- Custom `ai.rizom.brain.*` records are written with PDS validation disabled because public PDS instances do not know Rizom lexicons.
- Post cover images are uploaded as AT Protocol blobs and included in `ai.rizom.brain.post` records.
- Bluesky `app.bsky.feed.post` publishing is intentionally not part of `atproto_publish_post`; it should be added later through the `social-post` workflow.
