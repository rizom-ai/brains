---
"@rizom/brain": patch
---

The auth service is a declarative definition under the plugin id its class had, `auth-service`: the same passkey, OAuth, account and administration routes, the same passkey setup tool, and the same principal resolution. It is the brain's auth authority, the one service that binds the auth and account-settings backends and the runtime principals; a second service claiming the authority is refused, and the bindings are released when the service shuts down.
