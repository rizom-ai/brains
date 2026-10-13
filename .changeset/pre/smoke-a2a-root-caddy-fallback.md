---
"@rizom/brain": patch
"@rizom/ops": patch
---

Fix deployed smoke routing so the container healthcheck goes through Caddy, core-only root requests no longer fail when no site webserver is running, and GET `/a2a` returns a helpful non-404 response.
