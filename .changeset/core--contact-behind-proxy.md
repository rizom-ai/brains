---
"@rizom/brain": patch
---

Contact intake works behind a TLS-terminating proxy and on the preview host. With `http.trustForwardedProto: true`, a request forwarded as plain HTTP by a loopback or private-network proxy (such as Kamal's) counts as HTTPS when the proxy reports `X-Forwarded-Proto: https`; the header is ignored from public peers, and visitor identity stays the socket peer. With `preview: true`, the form also serves the deployment's preview origin, and a preview build's homepage opening links its contact door there.
