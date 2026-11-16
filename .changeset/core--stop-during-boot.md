---
"@rizom/brain": patch
---

A brain stopped while it is still starting now shuts down cleanly. Before, a `docker stop` (or Ctrl-C) during the first seconds of boot reached an app process before it listened for the signal, so the process died holding its database lease, and offline maintenance then refused to run until the lease expired. Now each process listens from the start of its boot: a stop during boot lets the boot finish, runs the full shutdown, and releases the lease. A stop during the migration step waits for it to finish and starts nothing.
