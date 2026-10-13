---
"@rizom/brain": patch
---

`brain tool` and `brain <command>` in the monorepo runner now boot register-only, as the bundled runtime already did. A full boot started a job worker on the queue's stable slot, which superseded a running app's worker session; that app then stopped claiming jobs until it was restarted. A one-shot CLI process owns no runtime work: it registers plugins, invokes the tool, and exits, leaving queued jobs to the running app.
