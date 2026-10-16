---
"@rizom/brain": patch
---

Update PostCSS to 8.5.29 with its required source-map-js and nested Nanoid resolutions. Keep the default restriction on annotation-loaded source maps to the CSS source directory, including resolved symlink paths, without an unsafe-map opt-in. Exercise indexed source-map offset rejection, prototype-safe node defaults, cross-chunk CSS escaping, comment-aware lists and async visitor ordering.

Retain the existing Tailwind processor and public UI/package boundaries. A refused external map's annotation can remain in CSS; this is not annotation removal, a filesystem sandbox, race-free path admission or HTML sanitization. Fixed deep-tree fixtures do not establish memory, runtime or shutdown bounds. No release-version bump, hosted rollout or clean-security-audit claim is introduced.
