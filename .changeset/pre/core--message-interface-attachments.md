---
"@brains/core": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

A message interface's inbound attachments are kept as chat keeps its uploads. Each is a `url` the runtime fetches or, new, a `read()` the interface answers with the bytes as a `Uint8Array`, for a platform whose media needs its credentials; never both. Only a trusted sender's or an admin's attachments are read. Each is checked by the message upload policy, kept in the runtime's shared upload store attributed to its sender and channel, and handed to the turn with an `upload` reference a later turn restores. A refused or unreadable attachment is skipped and the sender told, instead of failing the turn, and a message with nothing left to answer starts none. The shared upload store is named once, for the writers and readers that use it.
