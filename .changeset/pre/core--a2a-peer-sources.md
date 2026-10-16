---
"@brains/a2a": patch
---

A brain's A2A answer now carries its source citations as a `sources` task artifact (one data part, `{ sources: SourceCitation[] }`), streamed as an `artifact-update` event before the final status on `message/stream`. The A2A client reads that artifact from task results and streams into `data.sources`, empty when the peer cites nothing, so a calling brain can attribute what a peer told it.
