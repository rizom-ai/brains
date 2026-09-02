---
"@rizom/brain": minor
---

Restore `@rizom/brain/chat` as the headless Chat domain and transport contract after its temporary alpha rollback. The restored surface uses neutral `Chat*` names and provides versioned schemas, bounded API paths, bounded session context locators, a stateless stream decoder, and a fetch-injected client without exporting presentation logic. Add the capability-gated native Studio Chat working room, durable Inbox context handoff, and conditional `/chat` redirect while retaining standalone Web Chat for Chat-only composition.
