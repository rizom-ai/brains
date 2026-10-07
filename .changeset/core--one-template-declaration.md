---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/site-content": patch
"@brains/knowledge-map": patch
---

One declaration per template, whatever it can do

A service declared `templates` and `views` as separate slots. The runtime merged
them by key and refused the pair unless both named the exact same schema object:
one capability written twice, with a rule to keep the halves in agreement.

A template now says how it formats, how it renders, or both. `views`,
`ServiceViewDefinition` and the view schema map are gone, and the equality rule
with them. `ServiceViewSchema` is renamed `ServiceRenderSchema`, which is what
it always described.

Two capabilities move into the declaration because a real template needs them:
`dataSourceId`, for a template the runtime fills rather than an author writing
it, and `overlayFormatter`, for saved copy laid over what that source returned.
Knowledge-map needed both and was reaching past the slot with a raw template
object, which the slot then registered without its renderer. It declares them
now, and registration refuses a template that neither formats nor renders.
