---
"@rizom/site-sections": patch
"@rizom/site": patch
"@rizom/site-rizom": patch
"@rizom/brain": patch
---

Schema-first site sections: new `@rizom/site-sections` package authors a content
section from a single zod schema (`defineSection` ties the component props to
`z.infer<schema>`; `sectionGroup` bundles a namespace). The brain derives the
CMS fields and the markdown formatter from the same schema by introspection, so
there is no hand-written field DSL to keep in sync. `@rizom/site` carries the
opaque `SiteSectionGroup` contract and `SiteDefinition.sections`;
`createRizomSite` gains `sections` and `entityDisplay` options, `themeProfile`
becomes optional (omit it to ship no profile canvas and no
`data-theme-profile`), and `RizomFrame` gains a `canvas` prop to drop the dead
canvas mount on profile-less sites.
