---
"@brains/contracts": patch
"@brains/core": patch
"@brains/webserver": patch
"@brains/site-builder-plugin": patch
---

Declare the site-build manifest filename once, in `@brains/contracts`.

The manifest must never be served: the webserver blocks its path and the HTTP
route registry reserves it. But the filename was a string literal in three
packages that cannot import each other, so renaming it in the site builder
would have left two dead reservations behind and silently started serving the
build manifest publicly. All three now derive from one constant next to the
other site-build contracts.
