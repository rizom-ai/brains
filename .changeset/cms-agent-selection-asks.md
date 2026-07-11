---
"@brains/a2a": patch
"@brains/cms": patch
---

Let CMS operators ask one approved directory agent about selected markdown. The A2A interface now exposes its validated, signed outbound call path over the internal message bus, while the CMS adds an agent target picker and markdown answer panel. Ordinary answers remain dismiss-only; a dedicated rewrite mode can explicitly replace the selected draft text without changing the entity save path.
