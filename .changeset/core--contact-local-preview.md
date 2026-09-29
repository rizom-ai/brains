---
"@rizom/brain": patch
---

The contact form serves the local preview host beside a local origin (`http://preview.localhost:8080` beside `http://localhost:8080`), as the webserver already serves the preview site there, and treats `*.localhost` names as loopback. A preview-built page's link to the form no longer lands on "Contact unavailable" when a brain runs locally.
