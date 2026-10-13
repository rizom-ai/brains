---
"@rizom/brain": patch
---

The contact form's default limits fit a proxied deployment: every visitor arrives from the proxy's network, so the network limits now equal the global ones and requests and forms take their bound's maximum. Before, a hundred page views an hour from behind the CDN refused every visitor for the rest of the hour.
