---
"@brains/webdav": minor
"@rizom/brain": minor
---

A sync client can tell the drive a conflict is settled.

- `DELETE /dav/.brain/conflicts/<id>`, for sync clients (`X-Brain-Sync: 1`) with an app password that may save: the conflict is dismissed as that person, by the conflict service's own rules. The answer is the same whether the conflict was theirs, another person's, already settled or never there.
- The Rizom Brain plugin for Obsidian uses it: when a conflict is settled in Obsidian, its Inbox entry goes too.
