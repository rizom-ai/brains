---
"@brains/auth-service": patch
---

Consolidate the duplicated CMS profile-display-name resolver into one fail-closed helper with consistent trimming, and make the passkey verification results discriminated unions so the verified subject is always present — removing an unreachable session-subject fallback. Internal hardening with no change to runtime behavior.
