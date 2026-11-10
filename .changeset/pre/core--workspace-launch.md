---
"@brains/operator-view-react": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

A workspace action can send the operator's browser to a URL it computes, such as a provider's consent page: `defineWorkspaceAction({ ..., launch: { origins } })` declares absolute https origins and its `execute` answers `{ url }`. The runtime refuses, as `invalid_response`, any destination that is not an absolute https URL on a declared origin, carries credentials or is longer than 2048 characters, and Studio sends the page there only after that check and its own https check. A workspace action's `execute` is handed `accountSettings` (`save`, `claim`, `redeem`) for the operator's account; a claim made there names the operator's Studio session, so only that session's account redeems it at the provider's callback.
