---
"@rizom/ops": patch
---

Build each new shared Brain image with the full fleet's exact site/theme package union, including explicit builds, so smoke-to-fleet promotion reuses the same immutable image. Verify actual installed package versions before image reuse and in the scaffolded Deploy workflow before provisioning or container replacement. Fail closed on missing or mismatched packages without overwriting deployed tags.
