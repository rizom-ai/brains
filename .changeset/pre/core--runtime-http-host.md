---
"@rizom/brain": patch
---

The runtime hosts HTTP itself. The webserver interface is gone: the shell starts the one HTTP listener before initial sync, where a brain served HTTP before (a brain whose bundles include `web`, or a brain definition with an interface; never an eval run, a worker or a one-shot CLI command), and stops it before the plugins whose routes it serves. Every route, health endpoint, static and preview page, cache header and port a brain serves stays the same, and the host keeps the `webserver` name it had: its daemon is still `webserver:webserver`, and the Site and Preview endpoints and tool-backed API routes still name `webserver`. `/health/operate` lists that daemon right after the shell's own daemons rather than among the interfaces.

brain.yaml configures the host with top-level `port`, as before, and a new `http` section: `enabled` (default: whether the selected bundles include `web`), `preview` (default: whether a site builder runs), `hostname`, and `productionDistDir`, `previewDistDir` and `sharedImagesDir` for a site no site builder writes. Preview shares the production port, chosen by the request's host. A site builder's own output directories are now the ones served, so a brain that moves them no longer needs matching webserver directories; an `http` directory that names another one is refused at start.

`plugins.webserver`, and `webserver` in `add` or `remove`, are refused with where their settings went: `productionPort` is `port`, `enablePreview` is `http.preview`, the directories and `hostname` are under `http`, and `add: [webserver]` is `http.enabled: true`. `previewPort` and `apiPort` bound nothing and have no replacement. A brain definition's `deployment.ports.production` is now the port the brain listens on, as it was already the port its local links named.

A brain started on a port another process holds names the port again and says another brain may be running there. The hint had stopped appearing when Bun began reporting a taken port as "Failed to start server. Is port N in use?".
