---
"@brains/email-triage": minor
"@brains/dashboard": minor
"@brains/app": patch
---

Quality pass on the unified-inbox surfaces. Email triage serves its rail badge
through the CMS `badgeProvider` and shares the admin list-tool envelope and
workspace-admin guard from `@brains/plugins`. The dashboard package re-exports
`formatDate` beside the other widget primitives. Brain package resolution keeps
the owning package name together with the definition specifier instead of
re-deriving one from the other.
