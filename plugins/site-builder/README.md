# @brains/site-builder-plugin

The brain's static site: the routes it serves, the templates that fill them,
and the builds that write them out to the directories the runtime's HTTP host
serves.

## Composition

Site-builder is a declarative service. The canonical brain composes it as the
`site-builder` capability, under the plugin id `site-builder`; a brain
configures it in `brain.yaml` under `plugins.site-builder`, and a site package
supplies its layouts, routes and templates. The package default-exports the
definition; `createSiteBuilderPackage({ onSetup })` hands a test the pipeline
it builds.

## What it registers

- **Tool:** `site-builder_build-site` (admin, CLI `build`) requests a
  debounced build of the preview or production site.
- **Job:** `site-builder:site-build`, one build at a time with a 30-minute
  deadline. It renders every route with the brain's layouts and templates,
  records the outcome in its build status, and writes the output the HTTP
  host serves.
- **Resources:** `brain://site` (the site's metadata, domain and URLs),
  `site://routes` and `site://templates`.
- **Data source:** `site:navigation`, the navigation items of one slot, which
  site menus and footers read.
- **Templates:** the templates the brain's config names, under
  `site-builder:<name>`.
- **Contracts:** it answers the route contracts other packages declare their
  pages over and list them with, in every process, and gathers each
  package's head scripts, pages and layout slots when a build runs.
- **Static site output:** the production, preview and shared images
  directories it writes, which the runtime's HTTP host serves.

## Builds

A build is requested by the tool, the Studio workspace, and, with
`autoRebuild`, when a projection wave changes any type but notes. Once
startup content settles, every environment that already has output is built
again, since a start may bring new renderer code. Preview includes public
drafts; production includes published public content only.

## Operator surfaces

When Studio is installed, site-builder registers a **Site** workspace once
the brain is ready, with separate Preview and Live status, bounded recent
results, the route inventory, **Build preview**, and a confirmed **Update
live site** action, and takes it off Studio when it shuts down.

When the Dashboard is installed, site-builder adds a read-only site-health
widget to the **Publishing** tab. It reports preview and live health; build
controls stay in Studio, the tool and chat.

Build status is a site-builder-owned projection stored in runtime state.

## Configuration

| Key                   | Default                  | Meaning                                                     |
| --------------------- | ------------------------ | ----------------------------------------------------------- |
| `previewOutputDir`    | `./dist/site-preview`    | Where preview builds are written                            |
| `productionOutputDir` | `./dist/site-production` | Where production builds are written                         |
| `sharedImagesDir`     | `./dist/images`          | Optimized images both builds share                          |
| `workingDir`          | `./.react-work`          | Working directory for builds                                |
| `siteInfo`            | `Brain`                  | Fallback site metadata when site-info answers none          |
| `themeCSS`            | none                     | Theme CSS injected into every build                         |
| `headScripts`         | `[]`                     | Scripts injected into every page head                       |
| `analyticsScript`     | none                     | The older analytics script, when no head script replaces it |
| `templates`           | none                     | Templates to register                                       |
| `routes`              | none                     | Routes to register                                          |
| `layouts`             | none                     | Layout components (`default` required to render a route)    |
| `autoRebuild`         | `true`                   | Rebuild when content changes                                |
| `rebuildDebounce`     | `5000`                   | Milliseconds to wait before an automatic rebuild            |
| `staticAssets`        | none                     | Inline static assets a site package supplies                |
| `languages`           | none                     | The site's languages, the first its default                 |

## License

AGPL-3.0-only
