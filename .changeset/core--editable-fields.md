---
"@rizom/brain": patch
---

`system_create` and `system_update` set only the fields a person may edit: every frontmatter field but those a schema marks as the brain's own record (`studioWidget: "provenance"` or `"hidden"`), the same marks by which Studio shows a field read-only or leaves it off its form. A field the brain keeps for itself, such as an agent's card id or a file's processing state, is refused with the fields that can be set. For an OpenAI model, both tools are now strict: the model writes field changes as a list of `{ name, value }`, each typed as the entity types declare the field, and `null` removes a field on update.
