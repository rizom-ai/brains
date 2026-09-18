---
"@rizom/brain": patch
"@rizom/ops": patch
---

Compose operator-generated brain configuration as an object and serialize once. Carry per-user canonical plugin configuration through reconciliation, using the runtime's shared merge implementation with explicit preservation of null deletion markers until runtime resolution. Plugin schemas remain authoritative; no dashboard-specific operator switch is introduced.
