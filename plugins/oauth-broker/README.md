# @brains/oauth-broker

Provider-neutral managed OAuth callback and one-time credential grant broker.

The broker is a central `ServicePlugin` on the normal shared webserver. It authenticates registered brain instances, resolves exact allowlisted return URIs, correlates provider callbacks with expiring state, and delivers provider credentials through short-lived single-use grants. It never places provider credentials in browser redirects.

Provider adapters own authorization URLs, scopes, code exchange, token validation, and refresh/revocation semantics. The core treats credentials as opaque JSON objects.

Initial exact routes:

- `POST /oauth-broker/authorizations` — authenticated instance starts a provider flow.
- `GET /oauth-broker/callback/:provider` — exact callback route registered per injected provider.
- `POST /oauth-broker/grants/redeem` — the bound instance redeems a grant once.

The first deployment uses revocable per-instance HTTP Basic credentials over HTTPS and exact configured return URIs. Authorization state and credential grants are process-local, bounded, and intentionally short-lived; a restart invalidates an in-flight connection and the user can retry.

The package does not store reusable provider tokens. The originating brain redeems and stores its own token.
