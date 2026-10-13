---
"@brains/agent-discovery": patch
"@brains/plugins": patch
"@brains/dashboard": patch
"@brains/ui-library": patch
---

Keep Agent Network skill filtering valid by deriving both filter choices and row memberships from the complete normalized tag set. Shared tags and Brain-only gaps still rank first, but agent-only tags are no longer omitted and shared tags are no longer truncated.

Declarative list filters now accept the complete bounded membership space. Filters initially show 12 choices, expose searchable overflow and a Show all control, and preserve the selected choice when collapsed. Skill ingestion independently limits each skill to 30 non-empty tags of at most 120 characters.
