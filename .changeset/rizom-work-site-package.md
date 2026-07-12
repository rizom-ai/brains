---
"@brains/app": patch
"@brains/site-composition": patch
"@brains/site-content": patch
"@rizom/site-rizom": patch
"@rizom/site-rizom-work": patch
---

Add the Rizom Work site package and allow site packages to carry additive theme CSS that is layered with the selected theme at runtime. Move site-content definition authoring helpers into the shared site-composition contract so site packages do not depend on the site-content runtime plugin.
