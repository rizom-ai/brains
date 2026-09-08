---
"@brains/sdk": minor
---

The test harness can make a request

A package that serves routes could be installed but not asked anything, so the
one part of an authored package that answers the outside world was the one part
a test could not reach.

`harness.fetch(method, path, init?)` makes the request the way a running brain
would: the route's own security applies, its body and response are validated,
and the parsed answer comes back — or a `Response`, for a route that writes one
itself. A path nothing serves throws rather than looking like an empty answer,
and routes from every installed package are served, not only the last one.
