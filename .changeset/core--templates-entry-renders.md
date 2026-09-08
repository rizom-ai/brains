---
"@brains/sdk": minor
---

The templates entry describes a template, not a site build

`@rizom/brain/templates` is the advanced escape hatch for rendering the family
fields cannot express. It also exported a `SiteBuilder`, its options and result,
the registry a host keeps of view templates, and the site-content entity type —
things that run a build rather than describe a template.

Those are gone. No package in this repository imported any of them, and
rendering never needed them. What remains builds and describes a template:
`createTemplate`, `createTypedComponent`, the template and view-template
schemas, and the types that go with them.

The external guide's capability table also still listed a service `views` field,
which stopped existing when templates and views became one declaration.
