---
"@rizom/brain": patch
---

Retire Web Chat's operator bundle, page renderer, asset routes and browser-only session UI. Package only the guest Ask, box and dashboard bundles alongside Studio Chat. Remove browser-supplied `inboxContext` and its one-shot prefill contracts; Studio's authorized stored Inbox handoff remains. The old detach button is intentionally retired: start a new conversation for a different topic.
