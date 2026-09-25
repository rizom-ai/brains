---
"@rizom/brain": patch
---

Contact intake and the homepage opening work when a brain runs a separate worker process. The worker now builds contact's intake and declares its routes, so site builds there see the form, and it can run contact's daily maintenance, whose freshness is shared through runtime state; before, the check failed as unknown in the worker and intake closed as overdue after 26 hours. The worker never serves or gates the form. The homepage opening no longer requires an advertised contact endpoint, which only the web process registers, so preview and production builds in the worker render it.
