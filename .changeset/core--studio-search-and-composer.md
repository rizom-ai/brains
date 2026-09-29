---
"@brains/app-ui-react": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Empty the Chat composer when the message enters the transcript rather than when the server answers, and restore the draft if the send is refused. Give the library collection and the Chat session index one search field: live, debounced, with its own glyph and clear control instead of a label line and a submit button. Filters move into a panel that does not push the collection down, a filtered collection says how many entries matched, and the session index drops its duplicate labels and its always-present pager.
