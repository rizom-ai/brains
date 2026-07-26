# @rizom/site-smoke-canary

A minimal, externally consumable Rover site package used to prove the hosted
public-package path before a wider default-preset cohort rollout.

It is deliberately **content-independent**: a single `/` route renders a static
homepage template that shows the package's own build metadata, with no
datasource and no dependency on brain content (profile, posts, site-info). A
successful render therefore proves only what a canary should — that the
externally-hosted site package loaded, built, deployed, and styled — rather than
coupling the canary to a curated content model.

Built entirely against the documented public surface: `@rizom/brain/site`
(`SitePackage`, routes), `@rizom/brain/plugins` (`ServicePlugin`),
`@rizom/brain/templates` (`createTemplate`), and `@rizom/brain` (`z`). It also
emits `/.well-known/rover-site-canary.json` as a stable runtime verification
marker.

Pair it with `@rizom/theme-signal` at the same exact version.
