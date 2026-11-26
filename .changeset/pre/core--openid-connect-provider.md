---
"@brains/auth-service": patch
"@brains/contracts": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

A brain is an OpenID Connect provider. A sign-in that asks for `openid` gets a signed ID token, carrying the authorization request's `nonce` and, with `profile`, the person's name and `preferred_username`. `/userinfo` returns the same claims for an `openid` access token, and `/.well-known/openid-configuration` describes the provider. A person's `preferred_username` is derived from their display name on first use and never changes afterward. A plugin can register a confidential OAuth client under an id and secret it chooses with `provisionOAuthClient`, and such a client is never pruned.
