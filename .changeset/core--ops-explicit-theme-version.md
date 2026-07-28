---
"@rizom/ops": minor
---

Require an explicit themeVersion pin for @rizom-scoped themes in siteOverride. Sites and themes now publish on independent release cadences, so the theme's version can no longer be inferred from the site's — inferring it produced image builds that referenced npm versions that do not exist. Registry loading rejects a @rizom theme without a themeVersion (and a themeVersion on a bundled @brains theme) with a clear per-user error.
