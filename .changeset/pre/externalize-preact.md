---
"@rizom/brain": patch
---

Fix: externalize `preact` (and `preact/hooks`, `preact/jsx-runtime`,
`preact/compat`, `preact-render-to-string`) in the `@rizom/brain`
bundle so the CLI, library exports, and consumer site code all share
a single preact instance at runtime.

Before this fix, `brain.js` and `dist/site.js` each bundled their
own copy of preact. When a standalone site repo installed its own
`preact` dep and rendered its custom layout through the bundled
site-builder, three different preact instances were in play:

1. Preact inside `brain.js` (used by the site-builder's renderer)
2. Preact inside `dist/site.js` (used by `@rizom/brain/site` imports)
3. Preact in the consumer's `node_modules/preact` (used by the
   consumer's own JSX)

Preact hooks rely on a module-level `options` global to bridge
component rendering and hook state. Different instances have
different globals, so `useContext` and friends crashed with:

    TypeError: undefined is not an object (evaluating 'D.context')
      at useContext (preact/hooks/dist/hooks.mjs:...)

Discovered booting `apps/mylittlephoney` as the first standalone
extraction. After fixing the `@-prefixed` package ref resolution in
alpha.3, the site plugin loaded correctly but the first site build
crashed deep in the renderer the moment any hook (starting with
`Head.tsx`'s `useContext`) ran.

Every consumer (brain init scaffold, standalone site repos) already
has `preact` as a real dependency, so externalizing it always
resolves at runtime. The `dist/brain.js` and `dist/site.js` sizes
dropped by ~30KB combined as a nice side effect.

Adds a source-level regression test in
`packages/brain-cli/test/build-externals.test.ts` that asserts
`preact`, `preact/hooks`, `preact/jsx-runtime`, `preact/compat`, and
`preact-render-to-string` remain in the `sharedExternals` array of
`scripts/build.ts`. Runtime dual-preact detection is too expensive
for a unit test; the source check catches the exact regression
shape (someone removes preact from externals thinking "it's small,
bundle it").
