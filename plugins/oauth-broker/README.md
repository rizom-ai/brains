# @brains/oauth-broker

The managed OAuth broker. One central brain holds each provider's app secret and its single registered callback; instance brains connect through it without ever holding that secret.

## How it works

1. An instance brain calls `POST /oauth-broker/authorizations` with HTTP Basic instance credentials, the provider and its own single-use state. The broker answers with the provider's consent URL, carrying the broker's own state and its callback `/oauth-broker/callback/<provider>`.
2. The provider returns to that callback. The broker accepts its state once, exchanges the code through the provider's adapter, and sends the browser back to the instance's configured return address with the instance's state and a single-use grant. The credential never travels through the browser.
3. The instance redeems the grant at `POST /oauth-broker/grants/redeem`, server to server, with the same instance credentials. A grant is valid for two minutes, once, and only for the instance it was issued to; another instance's attempt neither redeems nor burns it.

Authorization state lives for ten minutes. Both stores are in memory, so a restart drops only connections in flight. The broker keeps no credential after redemption. The protocol is in `@brains/contracts` (`oauth-broker.ts`).

Provider semantics — consent URL, scopes, code exchange, the credential's shape — belong to the provider's adapter. The catalog composes LinkedIn's from `@brains/linkedin-import/broker-provider`.

## Configuration

The plugin is in the catalog but in no bundle; it runs on the central brain only.

```yaml
add:
  - oauth-broker
plugins:
  oauth-broker:
    publicUrl: https://connect.example.com
    providers:
      linkedin:
        clientId: ${LINKEDIN_BROKER_CLIENT_ID}
        clientSecret: ${LINKEDIN_BROKER_CLIENT_SECRET}
    instances:
      - id: ada
        secret: ${BROKER_INSTANCE_ADA_SECRET}
        returnUris:
          linkedin: https://ada.example.com/linkedin/oauth/broker/return
```

Register `https://connect.example.com/oauth-broker/callback/linkedin` as the LinkedIn app's redirect URI. Each instance secret is at least 32 characters; removing an instance revokes it. Without instances the broker serves no routes.
