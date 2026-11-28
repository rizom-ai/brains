---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/studio": minor
"@brains/unified-inbox": minor
"@brains/admin": minor
"@rizom/brain": minor
---

Studio opens on Home, and the event log moves to History.

- Home replaces Overview. It opens on one sentence that says how much needs you, and a box that saves a note or asks Chat. Below are three bands. "Needs you" lists only what waits, each item with the verb that clears it. "Continue" brings back recent drafts and conversations, and "Recently published" lists what went out. The brain's health is one line at the bottom, linking to History.
- Workspaces can say what needs the person. A registration's `attentionProvider` (or a declarative workspace's `attention`) returns items with a title, detail, severity and the verb that opens the page that clears them. The inbox and Administration provide theirs. A plugin that provides its own items keeps its dashboard widget out of "Needs you". Home's sidebar count is the number of items it lists.
- History, under Brain, keeps what happened over the last week instead of the last day. Repeated saves of one entry read once, and a run of the same change reads as one line.
- Overview's 24-hour timeline and its column of widgets are gone.
