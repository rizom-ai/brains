---
"@rizom/brain": patch
---

Integrate stored user-message creation with unique verbatim boundaries, permission floors and message/hash-pinned confirmation. Keep existing write ownership, visibility checks and sanitized errors; do not expose conversation or projection internals as author capabilities.

Reset projection batch ambient scope per worker job without weakening nested identity fences, actor context or durable batch coordination. Source reads and conditional mirror snapshots now retain exact stored content rather than a codec-decoded body, while normal typed reads retain their existing behavior. Cover byte fidelity and access boundaries with real SQLite and the canonical 17 KB conversation-to-Note regression.
