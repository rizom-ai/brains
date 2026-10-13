---
"@brains/studio": patch
---

Keep the Chat API path out of Studio's entry bundle. The Studio container holds the chat draft store so it can block navigation away from an unsent draft, which pulled the whole draft module, and with it the Chat API path, into a chunk the entry loads at startup. The draft key now lives in its own chat-only module, so it ships in the lazily loaded Chat chunk again and the split-asset contract holds.
