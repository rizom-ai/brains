---
"@rizom/site": minor
"@rizom/site-hub": patch
"@rizom/site-thefourth": patch
"@rizom/site-docs": patch
---

Breaking: a route places a schema-first section by its runtime name, `namespace:name` (`home:hero`), the same form every template has. The dotted `home.hero` was rewritten by `defineSite()` only, so a site exported without it rendered nothing for those sections; it is now rejected with the colon spelling to use. `defineSite()` still makes `content.home.hero` the fallback of the section placed as `home:hero`, and validation messages name sections the same way. The bundled sites use the colon form.
