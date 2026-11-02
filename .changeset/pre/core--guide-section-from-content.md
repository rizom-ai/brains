---
"@brains/guide": patch
"@rizom/brain": patch
---

A docs page lists each guide with the section its content names, also when the guide was imported before guides had a `section` field. Such a guide's stored metadata lacks the field, and an unchanged file is not imported again, so the guide was left out of its section.
