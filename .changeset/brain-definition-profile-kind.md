---
"@rizom/brain": patch
---

Let a brain definition select its profile kind. `profileKind` could previously only be set through an instance's `kind:` override, so no shipped brain selected one and the anchor profile always fell back to the base field schema. Rover's onboarding playbook writes `role` and `expertise`, and its starter content ships `expertise`, `currentFocus`, and `availability` — all kind-owned fields — so the persist validator rejected them and directory sync quarantined the profile. Rover now selects `professional`, Relay `team`, and Ranger `organization`; an instance `kind:` still wins. Also drops the `starterIdentity.anchorKind` config the three brains passed, which the profile plugin's schema silently discarded.
