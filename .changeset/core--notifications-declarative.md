---
"@rizom/brain": patch
---

Notifications is a declarative service. It answers `notifications:send` as before, in every process, under the same `notifications` plugin and config: delivering through the transport registered for the recipient's channel type, or the configured default recipient, and answering a missing recipient, a missing transport or a failed delivery as data with the same codes.
