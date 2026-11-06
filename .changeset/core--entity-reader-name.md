---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain/entities` exports the definition-typed reader as `EntityReader` instead of `DataSourceEntityReader`. It is the reader every context that reads entities is given (data sources, checks, evals, the Inbox, analytics reports and AT Protocol projections), not one particular to data sources. The old name is gone.
