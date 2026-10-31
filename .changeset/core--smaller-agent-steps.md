---
"@brains/core": patch
"@brains/ai-service": patch
"@brains/a2a": patch
"@brains/image-plugin": patch
"@brains/document-plugin": patch
"@rizom/brain": patch
---

Each agent step sends a smaller prompt: about 3,100 fewer input tokens per step on both a team brain (from about 14,200 to 11,100) and a personal brain (from about 11,900 to 8,800). The agent resends its whole prompt on every step of a turn, and much of it said the same thing twice. Each system tool's guidance now lives only in that tool's description, which the agent receives with the tool and only when the caller may use it. The Entity CRUD instructions keep the rules that span the tools and the entity type list. The agent-to-agent guidance moved into the `agent_call` description. The image and document instructions name the current `system_generate` operations. Tool schemas no longer carry the `$schema` draft URI.
