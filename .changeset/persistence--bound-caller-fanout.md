---
"@brains/series": patch
"@brains/site-builder-plugin": patch
"@brains/site-engine": patch
"@brains/admin": patch
---

Read series projection source types sequentially instead of submitting the entire registered catalog at once. Preserve progress promises through the static-build adapter and join them within the existing four-route concurrency and before returning build completion. Explicitly allow asynchronous reports in the renderer contract. Load composed Administration tabs sequentially so their nested Auth queries do not multiply admission demand. These changes respect unchanged SQL admission limits without adding persistence pools or retries.
