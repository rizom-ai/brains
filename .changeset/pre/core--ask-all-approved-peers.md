---
"@brains/agent-discovery": patch
"@brains/book": patch
"@rizom/brain": patch
---

A brain can ask all its approved peers. With `askAllApproved: true` under `plugins.agents`, `network_ask` asks every approved peer whatever its skills, the nearest first and three at most, and its description tells the model so; without it a question still goes to the peers whose skills fit it. A book brain answers in the language a question is asked in, or the one it asks for: a question that quotes another language, or names works in it, is not asked in that language.
