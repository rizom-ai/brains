---
"@rizom/brain": patch
---

Fix: declare `preact` and `preact-render-to-string` as runtime
dependencies of `@rizom/brain`.

Alpha.4 externalized `preact`, `preact/hooks`, `preact/jsx-runtime`,
`preact/compat`, and `preact-render-to-string` in the bundle to
avoid the dual-instance hook crash, but forgot to add them as
regular `dependencies` in `package.json`. Consumers installing
`@rizom/brain` from npm got the bundle without the runtime modules,
and the CLI crashed at import time with:

    Cannot find package 'preact-render-to-string' from
    '/.../node_modules/@rizom/brain/dist/brain.js'

Adds both packages as regular `dependencies`. `preact@^10.27.2` and
`preact-render-to-string@^6.3.1`, matching the versions used by
`@brains/site-builder-plugin` in the monorepo so runtime and
workspace stay aligned.

Consumers scaffolded via `brain init` also declare `preact` in
their own `package.json`, which is fine — bun hoists the shared
version to the top-level `node_modules/preact` and the externalized
imports all resolve to the same instance.
