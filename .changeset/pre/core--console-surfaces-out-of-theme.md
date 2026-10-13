---
"@brains/contracts": patch
"@brains/plugins": patch
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/studio": patch
"@brains/admin": patch
"@brains/web-chat": patch
---

Move the console-surface topology out of the theme package.

`@brains/console-theme` — described as a token sheet — hardcoded the console
plugin ids, their permission tiers, and a structural copy of
`RegisteredWebRoute`, so adding a console surface meant editing a CSS package.
`deriveConsoleSurfaces` and its table now live in `@brains/plugins`, next to
the web-route registry the doors derive from and typed against the real
`RegisteredWebRoute`; the presentational `ConsoleSurface` shape moves to
`@brains/contracts`, shared by the derivation and the strip renderer.
console-theme keeps exactly what its description claims: CSS, fonts, boot
scripts, and strip rendering. Per-plugin surface declaration at route
registration remains the end state, governed by the HTTP route registry plan.
