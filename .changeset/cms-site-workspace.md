---
"@brains/plugins": patch
"@brains/cms": patch
"@brains/content-pipeline": patch
"@brains/site-builder-plugin": patch
---

Add a multi-provider CMS workspace contract and register site-builder as the second provider. The CMS gains preview/live build controls and status, while Dashboard gets a read-only Site health tab backed by the same runtime-state projection.
