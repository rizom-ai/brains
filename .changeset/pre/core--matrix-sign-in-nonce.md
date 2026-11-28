---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Signing in to Matrix with your brain now completes. Approving the sign-in kept the request's OIDC nonce out of the approval form, so the brain rejected its own approval with "Invalid authorization approval token". The approval form now carries the nonce, and the ID token the homeserver receives includes it.
