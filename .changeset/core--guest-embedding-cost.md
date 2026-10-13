---
"@rizom/brain": patch
---

A visitor's answer is charged for its embeddings: the searches its tools ran and the search that found its sources. The embedding provider reports each call to a usage meter, each guest turn is measured, and its settlement counts the tokens and prices them at text-embedding-3-small's published rate ($0.02 per 1M tokens). An embedding model without pricing leaves the turn's cost unknown, so it is charged at the turn's maximum. Before, every guest answer recorded 0 embedding tokens.
