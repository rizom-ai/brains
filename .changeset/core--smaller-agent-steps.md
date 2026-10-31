---
"@brains/core": patch
"@brains/ai-service": patch
"@brains/a2a": patch
"@brains/image-plugin": patch
"@brains/document-plugin": patch
"@brains/site-builder-plugin": patch
"@brains/content-pipeline": patch
"@rizom/brain": patch
---

Each agent step sends a smaller prompt: about 3,300 fewer input tokens per step on both a team brain (from about 14,200 to 10,900) and a personal brain (from about 11,900 to 8,600). The agent resends its whole prompt on every step of a turn, and much of it said the same thing twice. Each system tool's guidance now lives only in that tool's description, which the agent receives with the tool and only when the caller may use it. The Entity CRUD instructions keep the rules that span the tools and the entity type list. The agent-to-agent guidance moved into the `agent_call` description, the site build guidance into `site-builder_build-site`, and the publishing guidance into `publishing_manage`; the identity section no longer repeats the write confirmation rules. The image and document instructions name the current `system_generate` operations. Tool schemas no longer carry the `$schema` draft URI or a confirmation's `expiresAt`.
