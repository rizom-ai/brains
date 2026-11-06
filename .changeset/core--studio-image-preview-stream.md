---
"@brains/plugins": patch
"@brains/web-chat": patch
"@brains/studio": patch
---

Studio image previews stream the stored bytes instead of returning a data URL, so asset-backed images preview without ever exposing an asset reference to the browser. The preview renders from an object URL that is released when the image leaves the page. `createArtifactResponse` in `@brains/plugins` builds the HTTP response for an artifact's bytes, streaming stored chunks or decoding an inline data URL, and the web chat image and document routes use it too.
