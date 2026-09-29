---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add declarative publish participation to the entity surface. An entity declares `publish` as a provider plus optional field names for the result id and timestamp, and the runtime announces it to the publish pipeline once that pipeline is listening.

The deferral is the point: four packages each hand-rolled a `plugins-registered` subscription so they announced themselves after `content-pipeline` had subscribed. Registration ordering is the runtime's problem, not an author's.
