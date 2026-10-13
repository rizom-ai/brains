---
"@brains/contracts": patch
"@brains/notifications": patch
"@brains/auth-service": patch
"@brains/core": patch
---

Fold `@brains/notification-contracts` into `@brains/contracts`.

A private 67-line package with three in-repo consumers has no cohesion argument
under the single-brain model — the email contracts already live inside
`@brains/contracts`, and this was the only contracts module holding its own
package boundary without lexicons or assets to justify it. The module moves to
`shared/contracts/src/notification.ts` with its types now derived from the
schemas (`z.input`/`z.output`) instead of hand-mirrored beside them.
