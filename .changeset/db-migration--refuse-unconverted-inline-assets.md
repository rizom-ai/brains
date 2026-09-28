---
"@rizom/db-migration": patch
---

Refuse historical inline image and PDF rows before publishing a verified import. The importer does not yet convert these payloads to the asset references required by 0.3; failure preserves the source backup and retains unpublished staging without exposing payloads in diagnostics.
