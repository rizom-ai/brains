---
"@rizom/brain": patch
---

Integrate content fingerprints for build-owned route scripts, calculated after site asset overrides are merged. Preserve route-local deduplication, caller-owned builds and private runtime helpers. Ignore inherited asset properties and fingerprint empty owned assets. External and undeclared script URLs remain unchanged.
