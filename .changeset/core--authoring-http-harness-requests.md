---
"@brains/sdk": patch
"@rizom/brain": patch
---

Normalize public HTTP harness request headers case-insensitively so explicit Content-Type values are not duplicated, and resolve relative request URLs against the configured domain. Keep HTTPS as the relative-request scheme and preserve absolute request URLs.

Allow explicit test-only socket metadata through fetch and fetchResponse so external authors can exercise trusted-peer routes without private APIs. Retain the runtime's detached, frozen transport projection and never infer a trusted peer from forwarding headers.
