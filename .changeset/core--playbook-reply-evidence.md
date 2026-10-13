---
"@brains/contracts": patch
"@brains/ai-service": patch
"@brains/playbooks": patch
"@brains/onboarding": patch
---

A playbook step can declare `Proven by: reply`: its Done when goal can then be proven by the assistant's saved reply in the run, not only by entity events. Use it for steps whose outcome is an answer in chat, such as transforming a note into an outline; other steps never accept a reply as proof, so a reply that only claims a saved change cannot complete them.

Completed, non-guest assistant replies carry host-written `assistantTurn` metadata: when the turn started and which entities its reads returned. A reply counts only for the step the run was already in when its turn began, and the goal check sees the reply text and those reads. Runs record when they entered their current step (`stateEnteredAt`). Playbook status shows only the reply's message id. The run evidence kind union now includes `assistant_reply`; strict consumers must accept it.

The bundled first knowledge loop marks "Retrieve and transform" as proven by reply.
