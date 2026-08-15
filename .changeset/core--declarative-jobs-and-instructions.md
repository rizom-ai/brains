---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add declarative durable jobs and agent instructions to the entity surface. An entity declares `jobs` keyed by job type — each an input schema plus one `handle` function — and `instructions` as plain text.

Content generation turns out to be a job the runtime simply names for you, so `EntityGenerationDeclaration` is now an alias of `EntityJobDeclaration` and both go through one validated handler builder.
