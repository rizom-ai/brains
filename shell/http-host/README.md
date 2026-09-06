# Runtime HTTP host

`@brains/http-host` is private shell infrastructure, not a plugin. Core finalizes the route table and writer-owned static-site output declarations, constructs `HttpHost`, and owns its startup and shutdown.

- Start only for declared routes or configured static output during normal non-worker, non-eval boot.
- Use the app's production `port`; preview shares the listener through hostname selection.
- Prefer site-builder's parsed output paths; reject conflicting HTTP overrides and multiple static-output owners.
- Serve handler/tool routes before static files, retaining exact/prefix precedence and fail-closed admission.
- Keep `/health/*` on the production control plane, including preview-host requests. Preview does not dispatch plugin routes.
- Create placeholders only on normal host startup, never composition checks.
- Close admission on shutdown. Drain sockets for up to five seconds, then abort request signals and force remaining sockets closed. Join admitted handler promises before core releases their dependencies. Handlers must cooperate with `Request.signal`; an uncooperative handler can delay shutdown rather than run against released services.

`ServerManager` owns Hono/Bun dispatch and sockets; `HttpHost` validates serving configuration and owns placeholder creation. Core owns route/site composition, public endpoint/interaction advertising, and the `http-host` runtime health check.

The stable route authoring/security contract is unchanged. There is no `plugins.webserver`, separate preview/API listener, or runtime plugin-membership check for hosting.
