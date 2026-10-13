---
"@brains/studio": patch
"@brains/admin": patch
"@rizom/brain": patch
---

Separate Account into accessible Profile, Sign-in & sessions, Linked identities, and capability-driven Personal settings sections. Preserve unsaved values while switching sections, clarify that settings belong to the current account on this brain, and link administrators to separate access management.

Preserve the account client binding when starting Add passkey so the existing authenticated WebAuthn registration ceremony can run.

Use consistent linked-identity terminology in Administration and label its existing audit tab Access activity. Preserve access checks, account-recovery controls, passkey protection, System navigation, and existing mutation contracts; do not expose proposed app-grant or shared-integration management features.
