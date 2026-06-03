---
"@brains/rover": patch
"@brains/cms": patch
"@rizom/brain": patch
---

Wire Rover CMS passkey login from `CMS_CONTENT_REPO_PAT`, include the variable in Rover env schemas, and avoid emitting a CMS auth base URL when no CMS login route is configured.
