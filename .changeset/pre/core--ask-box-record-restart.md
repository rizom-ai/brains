---
"@rizom/brain": patch
---

The homepage chat box stays on preview across a restart. Web Chat records at startup whether the box is offered, and it checked that guest chat could answer, which waits for the search index. That is never ready at startup, so every restart or deploy recorded the box as off until the owner switched guest chat again. The record now follows the owner's switch and remaining allowance; the box itself says when chat cannot answer yet.
