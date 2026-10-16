---
"@rizom/brain": patch
---

The atlas never shows a chat box that cannot answer. Web Chat now records the Ask box as available publicly only for a configured guest policy, and on preview for managed guest chat only while the owner has it switched on; it rewrites the record on every start and activation change. The shared box boot marks its host `data-ask-ready` once the controls are live, and the atlas keeps the box out of sight until then. On phones, the atlas text flows with the page with the box docked, instead of scrolling inside a clipped column.
