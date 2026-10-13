---
"@rizom/ops": patch
---

Replace rover-pilot's per-user GitHub secret push flow with age-encrypted checked-in user secret files, add `brains-ops age-key:bootstrap` and `brains-ops secrets:encrypt`, and update the published deploy scaffold to decrypt per-user overrides while falling back to shared pilot secret selectors.
