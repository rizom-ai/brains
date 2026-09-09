---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Project auth lookup results into frozen, bound caller, audit, federation, identity, and administration capabilities instead of returning the live auth service. Keep implementation fields, lifecycle methods, and unrelated commands out of each view while preserving late registration, withdrawal, and detached calls. Deliberately declared administration and federation commands remain available; this does not introduce a new authorization policy.

Replace the auth test stub's ineffective Proxy spread and type assertion with actual unsupported-administration methods. Add real-auth runtime regressions and public source/built/packed negative compile coverage.
