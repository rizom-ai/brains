---
"@rizom/brain": patch
---

Editing a social post's text works again, through both edits and a full replacement. Since social posts became declarative, every edit was refused as an "invalid content replacement": the check asked the file to state a slug the brain derives from its platform and title. A declared type's replacement is now checked as its file will be stored, and an edit of its body keeps the stored metadata.
