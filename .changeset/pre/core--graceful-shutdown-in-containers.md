---
"@rizom/brain": patch
---

Restores graceful shutdown in deployed containers. `docker stop` now reaches the brain and runs its whole shutdown: the queues drain, plugins stop (directory-sync makes its final export and git push), the database lease is released, and the databases close. Before, the published CLI handed every command to its own install as a second process, and SIGTERM ended the first one, so the brain itself was killed without shutting down. A global `brain` run in a directory with a local install still hands off to it, and now passes SIGINT and SIGTERM on and exits with its status.
