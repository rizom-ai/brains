---
"@rizom/brain": minor
---

Add master/detail composition to the operator view contract. A `detail` container pairs one collection with the panels of whichever row is open, selection is derived from the open row rather than flagged per item, and a `detail` link target opens a row through canonical query state instead of a workspace navigation. The host renders two panes on wide viewports and a single-pane drill-down on narrow ones. Unified Inbox is converted onto the contract, retiring the `inbox-open-detail` launch intent and the built-in workspace path helper it depended on.
