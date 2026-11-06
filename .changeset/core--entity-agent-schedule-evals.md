---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineEntity` now accepts `instructions`, `agentContext`, `scheduledGeneration` and `evals`, and `@rizom/brain/entities` exports `EntityAgentContextProvider`, `EntityScheduledGenerationDeclaration`, `EntityEvalDeclaration`, `EntityEvalContext` and `EntityEvalFixtures`. A declared type can tell the agent when to use it, ground the agent's turn with records the asker may see, answer the content pipeline's schedule by writing from one or all qualifying sources, and register evals with fixtures that seed, wait for embeddings and reset.
