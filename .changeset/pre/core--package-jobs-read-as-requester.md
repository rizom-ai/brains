---
"@rizom/brain": patch
---

A service package's job now reads entries with the access of the person whose request started it, so a guest's job sees only public entries. Before this, a package job read every entry. A job a package starts on its own, such as from a daemon, reads with that package's configured grant, which is public unless the brain grants more. A job whose requester's account is revoked before it runs is refused, and package jobs queued before the upgrade fail rather than run.
