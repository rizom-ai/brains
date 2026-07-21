# @brains/atproto

AT Protocol integration for Rizom brains.

This package currently covers AT Protocol identity, outbound publishing, and the first discovery slice:

- `ServicePlugin` package skeleton
- canonical `ai.rizom.brain.card` contract consumed from `@brains/atproto-contracts`
- `did:web` document route at `/.well-known/did.json` when configured
- app-password PDS client wrapper for mocked authentication, record reads/writes/deletes, and blob upload tests
- ambient brain card, projected-entity, and authority-gated canonical lexicon publishing
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
  // Only for the DNS-designated ai.rizom.brain.* authority account.
  lexiconAuthority: true,
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
    # Only for the DNS-designated ai.rizom.brain.* authority account.
    lexiconAuthority: true
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
- `lexiconAuthority`: defaults to `false`. When true, the ready trigger upserts every canonical `ai.rizom.brain.*` lexicon as a `com.atproto.lexicon.schema` record. Enable this only for the PDS account named by the authority's `_lexicon` DNS TXT record.

## Ambient publishing

The plugin exposes no agent tools. When `identifier` and `appPassword` are configured, it publishes automatically:

- `system:plugins:ready` upserts the public brain card as `ai.rizom.brain.card/self`. On the designated lexicon authority, it also converges canonical schemas under `com.atproto.lexicon.schema/<nsid>`.
- `publish:completed` upserts the source entity when its entity package has registered an ATProto projection and the entity is public.
- `entity:updated` keeps already-public projected entities current; a non-public update deletes the projected record.
- `entity:deleted` deletes the projected record when the deleted entity was public.

Projection registration is the consent gate: entities without a registered projection are ignored. Custom records are validated locally before an idempotent PDS `putRecord`; source entity IDs become stable record keys. The local entity remains the source of truth.

A PDS outage never fails the local publish/update/delete operation. Failures are logged and broadcast as `atproto:publish:failed` with the operation, entity type/id, collection, and error. This scoped event deliberately does not use the publish pipeline's `publish:report:failure`, which belongs to the source publish provider.

The internal `publishBrainCard`, `publishEntity`, `publishPost`, and `validatePdsCredentials` methods remain available to trusted runtime code and tests. `discoverBrainCards` likewise remains an internal bounded discovery operation: it accepts at most 50 repo DIDs/handles, validates `ai.rizom.brain.card/self`, deduplicates within a batch, and emits discovery events for reviewable agent-directory candidates.

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

1. Configure `identifier`, optional `repoDid`, optional `brainDid`/`anchorDid` overrides, and `appPassword: ${ATPROTO_APP_PASSWORD}`. If DID overrides are omitted, the card uses the conventional `did:web:<site-host>` and `did:web:<site-host>:anchor` identities. Set `lexiconAuthority: true` only when testing the PDS account designated by `_lexicon.<reversed-authority>` DNS.
2. Start a brain with the ATProto plugin enabled. The ready event should upsert `ai.rizom.brain.card/self` automatically and, for the designated authority, one `com.atproto.lexicon.schema` record per canonical NSID.
3. Confirm DID documents if using `did:web`:
   - brain root DID: `GET https://<brain-domain>/.well-known/did.json`
   - same-domain anchor path DID: `GET https://<brain-domain>/anchor/did.json`
4. Publish or update a public entity whose package registers a projection.
5. Use `com.atproto.repo.listRecords`/`getRecord` against the test repo to verify the card and projected entity record.
6. Turn that entity non-public or delete it, then verify its projected record is absent.
7. Stop the PDS or use invalid test credentials and confirm the local source operation still succeeds while `atproto:publish:failed` is logged/emitted.

## Current limitations

- Outbound ATProto OAuth is deferred; the prototype uses app-password authentication. This is separate from the brain's existing inbound OAuth server for clients calling the brain.
- Lexicon TypeScript generation is intentionally not wired into the workspace yet. For now, canonical lexicon JSON lives in `@brains/atproto-contracts`, and record mapper tests validate projections against existing entity schemas.
- Custom `ai.rizom.brain.*` records are still written with PDS validation disabled; protocol-native authority records let external resolvers discover and validate the canonical schemas but do not require every PDS implementation to dynamically load them during writes.
- Post cover images are uploaded as AT Protocol blobs and included in `ai.rizom.brain.post` records.
- Bluesky `app.bsky.feed.post` publishing is intentionally not part of `atproto_publish_post`; it should be added later through the `social-post` workflow.
