---
"@rizom/ops": patch
---

Make the shared fleet image topology unconditional: every effective Brain version resolves to one immutable `brain-${brainVersion}` image containing the union of exact site and theme package pins. Remove the image-contract selector and legacy site-hashed image mode.
