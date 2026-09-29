---
"@brains/site-content": minor
"@brains/site-composition": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
---

Migrate `@brains/site-content` to the declarative surface. The package is one `defineServicePlugin` importing `@brains/sdk` plus the shared libraries it already used; `SiteContentPlugin` and `siteContentPlugin` are deleted, and the default export is the service a brain composes.

The service is declared as `sections`, not `site-content`: a service and an entity type may not share a name, and the records are the content. Its tool is therefore `sections_generate` rather than `site-content_generate`. The entity type on disk is unchanged.

What the package does is now three declarations rather than three registrations. The `site-content` entity is declared. Each section a brain configured is declared as a template and a view under the namespace its author chose, because that is how a route names it. Filling a section in is this package's own job: it generates against the template the route names, formats through that template's formatter, and stores the result as its own entity — replacing an enqueue of the shell's `content-generation` job type, whose handler wrote `site-content` entities with hardcoded route and section metadata on this package's behalf.

Four runtime capabilities were added, each with a named consumer:

- **Templates and views declared from configuration.** Both slots now accept a function of config. A package that turns a brain's own configuration into page sections cannot name them in advance.
- **A template's own namespace and permission.** A section belongs to the site a brain composed rather than to the package that turned its configuration into templates, and a page section anyone can read is not admin-only.
- **A template that reads back.** `parse` on a template declaration, because content stored under a section has to be read back as the value it was written from; a format-only template made that impossible.
- **Generating against a template the runtime holds.** `capabilities(name)` and `generate(name, context)` on the templates handle a tool and a job get. The route says which template, and the registry supplies both the prompt and the schema.

`@brains/site-composition` gains `siteContentSectionParts`, which is what `createSiteContentTemplate` was already assembling: a section's schema, its formatter, its component and its permission. A package declaring the section needs the parts rather than the assembled `Template`.
