# From a Site Mockup to a Brain Site

You can design a site in Claude Code, Cursor, or any other frontend environment first and migrate it into a Brain afterwards. Treat the mockup as a design lab: the goal is to preserve its routes, components, content model, tokens, and assets—not its framework scaffolding.

## Make the mockup easy to migrate

Ask the prototyping agent to:

- use semantic HTML and Preact-compatible TSX or plain HTML;
- assume static server rendering rather than Next.js APIs or server components;
- split each page into a shell plus independent sections;
- pass copy and collection data into components as props instead of embedding it throughout the markup;
- define colors, typography, spacing, and breakpoints as CSS variables;
- use progressive enhancement or small browser scripts for interactions;
- produce desktop and mobile reference screenshots.

React-style presentational components usually port easily. Framework routing, server actions, client-only state, and application-wide data fetching do not. Keep those out of the mockup unless they are essential to the design.

A useful prompt is:

> Build this as a static-first, Preact-compatible site. Keep page copy in typed fixture objects, make each visual band an independent component, use CSS custom properties for design tokens, and avoid framework-specific routing or server APIs. Also produce a route list and a component/content inventory for migration.

## How the pieces map

| Mockup artifact                              | Brain destination                              |
| -------------------------------------------- | ---------------------------------------------- |
| Router or page list                          | `SiteDefinition.routes`                        |
| Header, footer, and page shell               | A Preact layout in `layouts`                   |
| Hero, feature grid, CTA, or other page block | A schema-first site section                    |
| Fixture page copy                            | `brain-data/site-content/<route>/<section>.md` |
| Site title and metadata                      | `brain-data/site-info/site-info.md`            |
| Posts, projects, decks, or other collections | Typed entities in `brain-data/`                |
| CSS variables and global visual rules        | `src/theme.css` or a reusable theme package    |
| Fixed package-owned scripts and assets       | `staticAssets` and section `runtimeScripts`    |
| Content images                               | Image entities under `brain-data/image/`       |
| External APIs or background behavior         | An existing capability or a service plugin     |

The Brain site builder produces static HTML with Preact. Routes decide which sections appear, layouts provide the shared shell, and section schemas define both component props and editable content. Themes are selected independently from site structure.

## Migration plan

### 1. Freeze a handoff bundle

Before changing the prototype, save:

- its source and assets, including font licenses;
- the route list and navigation behavior;
- a component inventory with each component's props;
- fixture content and representative collection data;
- design tokens and responsive breakpoints;
- screenshots at the important viewport sizes.

This becomes the visual acceptance reference while the implementation changes underneath it.

### 2. Start a Brain instance

Scaffold the appropriate Brain model, install its pinned dependencies, and get its built-in site running before replacing anything. A typical personal publishing site starts with Rover; team and network use cases may start with Relay or Ranger. Select a preset that includes `site-builder` and the entity capabilities the site needs.

Keep the first checkpoint boring: the Brain starts, content syncs, and an unchanged preview build succeeds.

### 3. Choose the site boundary

For a one-off customization, keep the structure in the instance:

- `src/site.ts` for layout, routes, and entity display metadata;
- `src/theme.css` for local visual overrides.

A local `src/site.ts` is discovered when `brain.yaml` does not set `site.package`. A local theme remains an additive layer over the selected base theme.

For a reusable or substantially custom site, create a site package using `@rizom/site`, `@rizom/site-sections`, and Preact. Export a `SiteDefinition`, install the package in the Brain instance, and select it with `site.package` in `brain.yaml`. Keep these package versions aligned with `@rizom/brain`. Use a separate theme package when the visual system should also be reusable.

### 4. Port presentation from the outside in

Port the shared layout first, then move one route and one section at a time.

For each mockup section:

1. define a Zod schema for its editable props;
2. turn the presentational component into a Preact component using those props;
3. register it with `defineSection` and a `sectionGroup` namespace;
4. reference it from a route as `<namespace>:<section>`;
5. compare the generated page with the reference screenshots.

Avoid a single giant homepage component. Independent sections are easier to edit, reorder, validate, and reuse.

### 5. Replace fixtures with durable content

Inline fixture content is useful during the first rendering pass. Once a section is stable, move its copy to:

```text
brain-data/site-content/<route-id>/<section-id>.md
```

Move repeatable domain content into the corresponding entity directories—for example, posts into `brain-data/post/`—and use route `dataQuery` entries or generated `entityDisplay` routes instead of hard-coded arrays. Put site-wide metadata in `brain-data/site-info/site-info.md`.

Create a new entity plugin only when the site introduces a genuinely new durable content type. Do not create an entity type merely to represent a visual component.

### 6. Reintroduce behavior deliberately

Prefer existing Brain templates, data sources, and service plugins for live data. Keep browser behavior small and progressively enhanced because the public site is statically rendered. If the mockup relied on a framework API route, classify it explicitly as one of:

- build-time data that should become an entity or data query;
- browser-only enhancement that can become a runtime script;
- operational behavior that belongs in a service plugin.

### 7. Verify preview before production

Run the Brain, then request a preview rebuild on the running app through the CMS **Build preview** action or the `site-builder_build-site` MCP tool with `environment: "preview"`. Check the browser output and `dist/site-preview`; do not validate only the source components.

Before switching production over, verify:

- every old URL has a matching route or redirect plan;
- navigation, metadata, responsive layouts, and keyboard behavior match the reference;
- editors can change normal copy without editing TSX;
- entity-backed lists use representative empty, small, and large data sets;
- no secrets or runtime auth state live in `brain-data/`;
- a production build contains only content intended for publication.

Keep the old mockup available until visual and URL parity are accepted, then retire it rather than maintaining two implementations.

## Related guides

- [Customization Guide](./customization-guide.md)
- [Content Management](./content-management.md)
- [Entity Types Reference](./entity-types-reference.md)
- [Theming Guide](./theming-guide.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
