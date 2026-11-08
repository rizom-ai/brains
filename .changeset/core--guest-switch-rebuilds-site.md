---
"@brains/contracts": patch
"@brains/site-builder-plugin": patch
"@brains/web-chat": patch
"@rizom/brain": patch
---

Switching guest chat on or off builds the site again, so the homepage Ask box appears or goes with the switch. The site rendered the box from a record Web Chat updates on each switch, but builds only followed entity changes, so the box waited for the next content edit or restart. Web Chat now sends the `siteBuildRequestContract` command after updating the record, and the site builder builds every environment it has already built, as it does after a start.
