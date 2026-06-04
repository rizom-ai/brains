# @brains/atproto

AT Protocol integration for Rizom brains.

This package currently covers AT Protocol identity, outbound publishing, and the first discovery slice:

- `ServicePlugin` package skeleton
- canonical `ai.rizom.brain.card` contract consumed from `@brains/atproto-contracts`
- `did:web` document route at `/.well-known/did.json` when configured
- app-password PDS client wrapper for mocked authentication, record reads/writes, and blob upload tests
- brain card publishing as `ai.rizom.brain.card`
- projection registry so entity plugins can register mappers against canonical ATProto contracts without centralizing entity records here
- candidate brain-card discovery via public `com.atproto.repo.getRecord` reads and internal message-bus events

## Configuration

In a brain model or preset:

```ts
atprotoPlugin({
  pdsEndpoint: "https://bsky.social",
  identifier: "example.com",
  repoDid: "did:plc:...",
  // Optional; defaults from site domain when omitted.
  brainDid: "did:web:example.com",
  anchorDid: "did:web:example.com:anchor",
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
    # Optional; defaults from domain/siteUrl when omitted.
    brainDid: did:web:example.com
    anchorDid: did:web:example.com:anchor
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
- `brainDid`: public brain DID. Defaults to `did:web:<site-host>` when omitted. If configured as `did:web:*`, its host must match the card `siteUrl` host. A root `did:web:*` exposes `/.well-known/did.json`.
- `anchorDid`: public human/operator DID. Defaults to `did:web:<site-host>:anchor` when omitted. A path-based `did:web:*`, for example `did:web:example.com:anchor`, exposes `/anchor/did.json`.
- `appPassword`: app password value. In committed instance config, use the standard `${ENV_VAR}` interpolation form, e.g. `${ATPROTO_APP_PASSWORD}`.

## Tools

### `atproto_validate_credentials`

Checks whether the configured identifier/app-password can create a PDS session. It does not publish records.

Input:

```json
{}
```

### `atproto_publish_card`

Upserts this brain's public discovery card to the configured PDS as `ai.rizom.brain.card` using rkey `self`.

Input:

```json
{ "dryRun": true }
```

Use `dryRun: true` to inspect the record without writing to the PDS.

The card is intentionally not a full A2A Agent Card. It is the public ATProto listing for a Rizom brain and requires:

- `siteUrl`
- `brain`: `{ did, name, role, purpose, values }`
- `anchor`: `{ did, name, kind }`
- `skills`
- `model`
- `version`
- `createdAt`

The operational A2A Agent Card is derived conventionally from `siteUrl` at `/.well-known/agent-card.json`.

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

Use this for generic projection-backed publishing. The entity plugin owns the record mapper; the canonical lexicon contract comes from `@brains/atproto-contracts`.

### `atproto_discover_brain_cards`

Reads public `ai.rizom.brain.card/self` records from candidate AT Protocol repo DIDs or handles, validates them against the canonical brain-card contract, and emits internal discovery events for the agent-discovery plugin.

Input:

```json
{
  "repos": ["did:plc:example", "brain.example.com"]
}
```

Notes:

- Discovery is bounded to 50 repos per call.
- Invalid cards are skipped and reported in the result.
- Duplicate card URI/CID pairs in the same batch are skipped.
- New brains enter agent discovery as reviewable `status: discovered` agents; existing approved agents may be enriched but are not downgraded.

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
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";

AtprotoProjectionRegistry.getInstance().register({
  entityType: "note",
  collection: "ai.rizom.brain.note",
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.note"],
  validate: false,
  buildRecord: async ({ entity }) => ({
    $type: "ai.rizom.brain.note",
    title: String(entity.metadata.title),
    body: entity.content,
    sourceEntityType: entity.entityType,
    sourceEntityId: entity.id,
    createdAt: entity.created,
  }),
});
```

The registry rejects collection/lexicon mismatches. Before dry-run results or PDS writes are returned, the ATProto plugin validates projected records against the registered canonical lexicon locally. PDS writes may still use `validate: false` for custom `ai.rizom.brain.*` records because public PDS instances do not necessarily know Rizom lexicons. The blog `post` projection is registered by `@brains/blog`; other entity packages should follow the same mapper ownership pattern.

## Manual smoke checklist

Use a test PDS/Bluesky account, an app password, and a controlled public site domain.

The committed Rover full test app uses the Alex example identity (`domain: alex.example.com`, `identifier: alex.example.com`) so it stays aligned with the eval content. `alex.example.com` is fixture data, not a live PDS handle/domain. For a real live smoke, use the matching deployed Alex domain/account and keep only the app password in the environment.

1. Configure `identifier`, optional `repoDid`, optional `brainDid`/`anchorDid` overrides, and `appPassword: ${ATPROTO_APP_PASSWORD}`. If DID overrides are omitted, the card uses the conventional `did:web:<site-host>` and `did:web:<site-host>:anchor` identities.
2. Start a brain with the atproto plugin enabled.
3. Confirm DID documents if using `did:web`:
   - brain root DID: `GET https://<brain-domain>/.well-known/did.json`
   - same-domain anchor path DID: `GET https://<brain-domain>/anchor/did.json`
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
11. Discover a known card from another repo:
    - `atproto_discover_brain_cards { "repos": ["<repo-did-or-handle>"] }`

## Current limitations

- Outbound ATProto OAuth is deferred; the prototype uses app-password authentication. This is separate from the brain's existing inbound OAuth server for clients calling the brain.
- Lexicon TypeScript generation is intentionally not wired into the workspace yet. For now, canonical lexicon JSON lives in `@brains/atproto-contracts`, and record mapper tests validate projections against existing entity schemas.
- Custom `ai.rizom.brain.*` records are written with PDS validation disabled because public PDS instances do not know Rizom lexicons.
- Post cover images are uploaded as AT Protocol blobs and included in `ai.rizom.brain.post` records.
- Bluesky `app.bsky.feed.post` publishing is intentionally not part of `atproto_publish_post`; it should be added later through the `social-post` workflow.
