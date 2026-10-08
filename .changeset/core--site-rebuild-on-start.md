---
"@brains/site-builder-plugin": patch
---

A brain builds its site again when it starts: every environment that already has an output (production, and preview where configured) is requested once the site builder is ready, so a restart or an upgrade that brings new renderer code reaches the served site without an operator asking. An environment never built stays untouched; a build whose inputs and renderer are unchanged still skips rendering.
