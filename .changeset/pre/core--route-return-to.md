---
"@brains/plugins": patch
"@rizom/brain": patch
---

A service's `GET` route can return the browser to one of the package's own Studio workspaces: `defineRoute({ ..., returnTo: workspace, handle })`, whose handler answers with the workspace's query input, inline literals kept. The runtime checks the answer against the workspace's query as the URL carries it and answers `303` to the workspace with that query and `Cache-Control: no-store`; an answer the query refuses is `invalid_response`, a route answers `no_handler` while no Studio hosts the workspace, and a workspace the package does not bind is refused when it registers. A Studio workspace's definition now carries its query schema's type.
