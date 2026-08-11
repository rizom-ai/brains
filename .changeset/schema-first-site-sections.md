---
"@rizom/site": minor
"@rizom/site-rizom": patch
"@rizom/site-rizom-ai": patch
"@rizom/brain": patch
---

Schema-first site sections now live directly in the one-import `@rizom/site`
SDK. `defineSection` ties component props to `z.infer<schema>` and
`sectionGroup` bundles a namespace. The brain derives CMS fields and markdown
formatting from that same schema, so there is no parallel field DSL.
`@rizom/site-sections` remains an alpha-only package and is removed before the
stable contract. `createRizomSite` gains `sections` and `entityDisplay` options, `themeProfile`
becomes optional (omit it to ship no profile canvas and no
`data-theme-profile`), and `RizomFrame` gains a `canvas` prop to drop the dead
canvas mount on profile-less sites.
