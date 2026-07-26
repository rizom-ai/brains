---
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/admin": patch
"@brains/cms": patch
"@brains/web-chat": patch
---

Filter the console surface strip by the caller's permission level so a Trusted user no longer sees an Admin-only door. `deriveConsoleSurfaces` now takes the caller's level and omits surfaces above it (failing closed to public-only when unavailable), and every console surface (Dashboard, Chat, CMS, Admin) passes its resolved level. Authenticated non-Admins who reach `/admin` directly are redirected to their own `/account` surface instead of a bare, unstyled denial.
