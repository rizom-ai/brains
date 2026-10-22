---
"@rizom/brain": patch
---

Studio shows a site build's real outcome, and a build after a failed one renders again. A brain's web and worker processes each kept their own copy of the build status and wrote it back whole, so one could erase the other's update: a build that published could still show as failed. Status records are now read and written back atomically by every process. A build with unchanged inputs used to skip publication even right after a failed build; it now renders and publishes again until a build succeeds.
