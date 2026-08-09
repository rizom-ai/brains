---
"@rizom/brain": patch
---

Add first-class `public`, `shared`, and `restricted` visibility to `system_create` so agent-backed interfaces can save non-public notes and uploads without rewriting exact source material. Preserve the requested scope through confirmation, permission checks, direct persistence, and asynchronous upload promotion, and add personal/team routing eval coverage.

Let Trusted collaborators capture notes and links on every posture, not only on a team brain. The platform baseline is `"*": admin`, and only the team bundle granted those types, so `system_create` was offered to a Trusted caller and then refused with "Creating `note` requires Admin permission". The core bundle now grants `note` and `link` at Trusted for create and update, leaving delete, extract, and publish with Admin. Public callers remain unable to create either type.
