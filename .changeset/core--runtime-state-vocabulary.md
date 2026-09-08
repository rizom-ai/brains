---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/atproto": patch
"@brains/content-pipeline": patch
"@brains/email-workflows": patch
"@brains/playbooks": patch
"@brains/site-builder-plugin": patch
"@brains/directory-sync": patch
---

One name per lifetime: `state` is what setup returned

A service's setup context called the durable store `state`, and every slot below
it called the setup result `state` too. One word for two different things in the
same declaration is how a package ends up writing notes it means to keep into a
value that vanishes with the process.

The durable store is `runtimeState` on services now, which is what interfaces
have always called it. `state` means the setup result everywhere.

Nothing moves on disk. A package's notes stay filed under its package name, and
a test pins that: it writes through the renamed accessor and reads the value
back through the namespace the store has always used.
