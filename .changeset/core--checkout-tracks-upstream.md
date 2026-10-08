---
"@rizom/brain": patch
---

A content repository checked out in place now tracks `origin` as a clone would, and a checkout without an upstream gets one on its next start; the pre-deploy backup resolves `@{upstream}` and refused a checkout that had none.
