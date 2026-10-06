---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Drain complete auth HTTP handlers and facade operations before runtime shutdown. Keep independent requests concurrent, allow admitted handlers to finish nested auth calls, and defer later callers until cleanup settles. Track nested operations independently, give admitted background callbacks the same owner while skipping new scheduled ticks during shutdown, reject self-close instead of deadlocking, and prevent detached continuations from reusing completed request scopes.
