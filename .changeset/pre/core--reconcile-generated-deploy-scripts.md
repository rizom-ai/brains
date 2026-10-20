---
"@rizom/brain": patch
"@rizom/ops": patch
---

Reconcile prior generated deploy scripts on init rerun, so existing standalone and fleet repositories pick up the scoped health watchdog installer (and future script updates) instead of keeping the vintage they were scaffolded with. Content that no longer carries the generated-script fingerprint is treated as owner-customized and left untouched.
