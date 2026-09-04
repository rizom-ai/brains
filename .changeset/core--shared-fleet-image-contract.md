---
"@rizom/brain": patch
"@rizom/ops": patch
---

Add an explicit shared fleet image contract so Build emits one immutable image per effective Brain version, installs the version-wide union of exact site and theme package pins, rejects conflicting pins, and keeps Build and Deploy on the same tag contract.

Ship React declarations with the public Brain package so packed consumers can typecheck the React-backed service view contract.
