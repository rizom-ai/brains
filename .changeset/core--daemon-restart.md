---
"@rizom/brain": patch
"@brains/plugins": patch
---

A daemon that fails after it was ready is restarted instead of leaving the brain silently not receiving. A `defineDaemon({ run })` daemon or a message interface's `listen` that rejects, or returns before it is stopped, is logged at error level with its id and the error's message, and run again after a wait of one second that doubles up to five minutes, with jitter; health stays `error` until a restarted run reports ready, which resets the wait. An account daemon's task is restarted the same way, and is no longer left failed until its settings are saved again. Stopping the brain, removing the account or changing its settings cancels a pending restart.
