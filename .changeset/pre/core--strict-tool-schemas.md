---
"@rizom/brain": patch
---

An OpenAI model is held to each tool's input schema in strict mode, so a call cannot leave out a required field or carry one the tool lacks. The brain derives the strict form from the tool's own schema: every object closed, every field listed, and a field the caller may leave out accepting `null`, which the brain drops before the tool's schema validates the call. A tool that takes a map of any keys, such as an entity's frontmatter fields, is sent as before.
