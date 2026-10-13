---
"@rizom/brain": patch
---

Add plugin-owned `content`/`system` entity-type classification, defaulting to content and available through public `defineEntity` authoring. Mark prompts, skills, playbooks, assessments, agents, identity and site configuration, and grouping definitions as system types.

Use one registry-enforced grouping eligibility rule for runtime declarations and Studio discovery. System types never contribute fields or membership counts and never appear as exclusion choices. Studio navigation consumes registration metadata, including custom system types, rather than inferring classification from type names.

Keep authored Markdown and exact memberships unchanged. Previously saved system exclusions remain in source but are not presented as selectable or unavailable options. Other unavailable exclusions remain visible and removable.
