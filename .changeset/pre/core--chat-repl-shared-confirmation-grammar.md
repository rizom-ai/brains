---
"@brains/chat-repl": patch
---

Route CLI confirmations through the shared grammar and render the full
response plan.

The REPL parsed approvals with its own positional grammar and rendered only
approval cards, so sources, actions, and artifact cards never reached the
terminal, and the same user action had incompatible grammars across
interfaces. Confirmations now route through `routeConfirmationResponse` —
approval ids work everywhere, ambiguity and unknown-id notices come from the
shared vocabulary — with `yes 2` kept as terminal sugar that lowers to the
matching approval id before routing. Responses render through
`buildResponsePlan`, so every card kind reaches the terminal via the shared
text fallback.
