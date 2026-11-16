---
"@rizom/brain": patch
---

Topic extraction now keeps a new topic that a model lists among a source's matches to existing topics, where before only a topic named as the source's proposal counted. Local models answer that way most of the time, so a brain on local models never got its first topics.
