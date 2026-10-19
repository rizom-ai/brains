---
"@rizom/brain": patch
---

Studio has a Board under Work: the team's action items in To do, Doing, Blocked and Done columns. Drag a card to another column, or use its Move menu; a card someone else already moved is reported rather than overridden. Open a card to read its text and notes, and add a note. Filter the board to a project, a value of the brain's `projects` grouping, and see the project's counts and blocked cards. Blocked cards appear in the Inbox with Resume, Done and Drop, and an Inbox item can be tracked on the board as a card. In chat, `action_item_update` moves a card or adds a note. Cards moved, grouped or edited stay put when a conversation is summarized again. Studio Overview lists blocked action items under Needs you and links to the board.

Action item frontmatter is trimmed to what a card uses: status, capture time, its conversation or Inbox source, and flat `assignedTo` and `requestedBy` entries (`{ name, id }`). Items stored in the earlier shape are read as before and rewritten in the trimmed shape on their next change.
