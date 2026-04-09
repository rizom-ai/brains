# Plan: `layouts/*` Export Inventory and Migration Classification

## Context

The `layouts/` packages are legacy reusable site-composition packages. They are part of the transition toward:

- moving composition concerns into `sites/`
- moving truly generic UI primitives into `shared/`
- allowing sites to extend other sites explicitly

Before we can delete `layouts/`, we need a symbol-level inventory of what each package currently exports and where each export should go.

## Classification rules

Use these rules when assigning a target:

- **`sites/`** — site wiring, routes, templates, data sources, site plugin config, and site-specific page layouts
- **`shared/`** — generic UI primitives or helpers with no site identity
- **keep temporarily** — compatibility-only exports that must survive until all consumers are migrated

## Executive summary

Current `layouts/*` exports are overwhelmingly **site composition** concerns, not reusable primitives. That means most exports should move into `sites/` first. Only after decomposing the layout components should we decide whether any lower-level pieces belong in `shared/`.

In other words:

- **short term:** move the package surface into `sites/`
- **medium term:** extract reusable atoms from the layout files into `shared/`
- **long term:** remove `layouts/` entirely

## Package inventory

### `layouts/personal`

Public entrypoint: `layouts/personal/src/index.ts`

| Export                    | Source                                   | Current role                                                 | Proposed target | Notes                                       |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------ | --------------- | ------------------------------------------- |
| `PersonalSitePlugin`      | `src/plugin.ts`                          | Site plugin wrapper that registers datasources and templates | `sites/`        | Site composition, not shared logic          |
| `personalSitePlugin`      | `src/plugin.ts`                          | Factory for the plugin                                       | `sites/`        | Keep alongside plugin class                 |
| `PersonalSiteConfigInput` | `src/plugin.ts`                          | Public config input type                                     | `sites/`        | Keep with the plugin contract               |
| `routes`                  | `src/routes.ts`                          | Route definitions for personal site                          | `sites/`        | This is site wiring                         |
| `HomepageLayout`          | `src/templates/homepage.tsx`             | Homepage page template/layout                                | `sites/`        | Could later split primitives into `shared/` |
| `AboutPageLayout`         | `src/templates/about.tsx`                | About page template/layout                                   | `sites/`        | Site-specific page composition              |
| `HomepageDataSource`      | `src/datasources/homepage-datasource.ts` | Homepage data resolver                                       | `sites/`        | Depends on site content strategy            |
| `AboutDataSource`         | `src/datasources/about-datasource.ts`    | About page data resolver                                     | `sites/`        | Site-specific content source                |
| `routes as default`       | `src/routes.ts`                          | Default export for route resolution                          | `sites/`        | Compatibility surface only                  |

#### Personal package support exports

These are not currently re-exported from the package root, but they are part of the package’s migration surface:

| Symbol                     | Source                            | Current role                             | Proposed target | Notes                                                 |
| -------------------------- | --------------------------------- | ---------------------------------------- | --------------- | ----------------------------------------------------- |
| `personalSiteConfigSchema` | `src/plugin.ts`                   | Plugin configuration schema              | `sites/`        | Internal today, but should move with the site package |
| `PersonalSiteConfig`       | `src/plugin.ts`                   | Inferred config type                     | `sites/`        | Internal today, but should move with the site package |
| `personalProfileSchema`    | `src/schemas/personal-profile.ts` | Site-specific profile validation         | `sites/`        | Should move with the owning site package              |
| `personalProfileExtension` | `src/schemas/personal-profile.ts` | Frontmatter extension for anchor profile | `sites/`        | Site-specific schema extension                        |
| `PersonalProfile`          | `src/schemas/personal-profile.ts` | Inferred profile type                    | `sites/`        | Keep with schema                                      |

### `layouts/professional`

Public entrypoint: `layouts/professional/src/index.ts`

| Export                   | Source                                   | Current role                                                 | Proposed target | Notes                                                    |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------ | --------------- | -------------------------------------------------------- |
| `ProfessionalSitePlugin` | `src/plugin.ts`                          | Site plugin wrapper that registers datasources and templates | `sites/`        | Site composition, not shared logic                       |
| `professionalSitePlugin` | `src/plugin.ts`                          | Factory for the plugin                                       | `sites/`        | Keep alongside plugin class                              |
| `routes`                 | `src/routes.ts`                          | Route definitions for professional site                      | `sites/`        | This is site wiring                                      |
| `HomepageListLayout`     | `src/templates/homepage-list.tsx`        | Homepage page template/layout                                | `sites/`        | Could later split primitives into `shared/`              |
| `AboutPageLayout`        | `src/templates/about.tsx`                | About page template/layout                                   | `sites/`        | Site-specific page composition                           |
| `SubscribeThanksLayout`  | `src/templates/subscribe-result.tsx`     | Subscription success page template/layout                    | `sites/`        | Site-specific but reusable only within the site family   |
| `SubscribeErrorLayout`   | `src/templates/subscribe-result.tsx`     | Subscription error page template/layout                      | `sites/`        | Site-specific but reusable only within the site family   |
| `HomepageListDataSource` | `src/datasources/homepage-datasource.ts` | Homepage data resolver                                       | `sites/`        | Depends on site content strategy                         |
| `AboutDataSource`        | `src/datasources/about-datasource.ts`    | About page data resolver                                     | `sites/`        | Site-specific content source                             |
| `ProfessionalLayout`     | `src/layouts/ProfessionalLayout.tsx`     | Core professional layout component                           | `sites/`        | Candidate for later decomposition into shared primitives |

#### Professional package support exports

These are not currently re-exported from the package root, but they are part of the package’s migration surface:

| Symbol                         | Source                                | Current role                             | Proposed target | Notes                                    |
| ------------------------------ | ------------------------------------- | ---------------------------------------- | --------------- | ---------------------------------------- |
| `professionalProfileSchema`    | `src/schemas/professional-profile.ts` | Site-specific profile validation         | `sites/`        | Should move with the owning site package |
| `professionalProfileExtension` | `src/schemas/professional-profile.ts` | Frontmatter extension for anchor profile | `sites/`        | Site-specific schema extension           |
| `ProfessionalProfile`          | `src/schemas/professional-profile.ts` | Inferred profile type                    | `sites/`        | Keep with schema                         |
| `professionalSiteConfigSchema` | `src/config.ts`                       | Plugin configuration schema              | `sites/`        | Site-specific config schema              |
| `ProfessionalSiteConfig`       | `src/config.ts`                       | Inferred config type                     | `sites/`        | Keep with schema                         |
| `ProfessionalSiteConfigInput`  | `src/config.ts`                       | Public config input type                 | `sites/`        | Keep with schema                         |

## What should move where

### Move to `sites/`

These are the clear winners:

- route definitions
- plugin wrappers and factories
- data sources
- page templates/layout assemblies
- site config schemas
- site-specific profile/frontmatter extensions

### Potential `shared/` candidates later

Only after splitting the current page/layout files, we may discover reusable pieces such as:

- navigation/header/footer primitives
- card/grid/section wrappers
- shared CTA blocks
- shared profile renderers

Those should move to `shared/` only if they are genuinely reusable outside one site family.

### Keep temporarily

The only things worth keeping temporarily are compatibility surfaces that prevent a large-bang migration.

Examples:

- root exports that consumers already import directly
- a temporary re-export shim while `sites/` packages are introduced
- any package alias needed to keep `brain init` or existing sites working during the transition

## Migration order

1. **Move package roots into `sites/`**
   - create the new site packages
   - re-home plugin wrappers, routes, templates, and datasources

2. **Update consumers**
   - switch site packages, CLI bootstrap, and tests off `@brains/layout-*`

3. **Split reusable UI primitives**
   - extract any generic building blocks into `shared/`

4. **Delete legacy `layouts/` packages**
   - remove package directories
   - clean up workspace references and docs

## Risks

- **Over-extracting too early** — moving too much into `shared/` can create a generic but unhelpful abstraction layer
- **Under-extracting** — leaving site-specific code in `shared/` would blur boundaries
- **Compatibility churn** — current consumers use `@brains/layout-*` directly, so migration must be staged

## Success criteria

- every current `layouts/*` public export has a destination
- site composition lives in `sites/`
- shared primitives live in `shared/`
- no consumer imports `@brains/layout-*`
- `layouts/` can be removed without changing behavior

## Related docs

- `docs/plans/site-composition-inheritance.md`
- `docs/architecture-overview.md`
- `docs/theming-guide.md`
- `docs/plans/standalone-site-authoring.md`
