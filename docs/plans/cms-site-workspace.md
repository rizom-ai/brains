# Plan: Optional CMS site workspace

## Status

**Proposed.** Add a Site workspace to the CMS when `@brains/site-builder-plugin` is
installed. The workspace operates preview and production builds without making the CMS
depend on site-builder or duplicating site configuration.

Interaction reference:
[cms-site-workspace-mockup.html](../design/cms-site-workspace-mockup.html).

## Goal

Give operators one management place beside their content, plus a Dashboard health glance,
to answer four questions:

1. Is the preview current and can I open it?
2. Is the live site healthy and when was it last built?
3. What is building or what failed?
4. Can I safely rebuild preview or update the live site?

The responsibility split is:

- `@brains/site-builder-plugin` owns build requests, job execution, status, routes, URLs,
  and build-result projection;
- `@brains/cms` owns workspace navigation, authenticated transport, and the first-party
  Site renderer;
- `@brains/dashboard` presents a compact, read-only Site health digest and links to the CMS
  workspace when available;
- site metadata and authored site sections remain normal entities edited through the
  existing CMS editor;
- `@brains/content-pipeline` continues to own content queueing and external publication.

## Product language

Keep the two operational workspaces distinct:

- **Publishing** manages content intent, queue order, retries, and external providers.
- **Site** builds a static preview or updates the production output served as the live
  website.
- **Save** persists one entity through entity DB → file → git. It does neither operation
  above.

Use **Build preview** and **Update live site** as action labels. Do not call a preview build
“publish,” and do not describe a production build as a deployment when no deployment
provider ran.

## Required optionality

Runtime registration determines availability. The browser must not probe hard-coded
site-builder routes.

| Installed plugins        | CMS behavior                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| CMS only                 | Existing entity editor; no Operations group                        |
| CMS + content pipeline   | Publishing workspace only                                          |
| CMS + site builder       | Site workspace only                                                |
| CMS + both providers     | Publishing and Site appear under Operations in deterministic order |
| Site builder without CMS | Existing tool, messages, auto-rebuild, and jobs continue unchanged |

Removing site-builder removes its CMS navigation item, route, API descriptor, actions,
entity links, and Dashboard widget. It must not leave a disabled Site item or an error
panel.

When Dashboard and site-builder are present, Site health remains visible even if CMS is
absent. In that composition the digest omits its CMS management link; tools and chat remain
the build-control path.

## Current state

- The CMS is a first-party React editor with entity, schema, assist, upload, and sync APIs,
  but no plugin workspace registry.
- The publishing-workspace plan introduces the generic registration boundary and the first
  `publishing` renderer.
- Dashboard already supports provider-registered, permission-filtered widgets and group
  digests, but site-builder does not register one.
- Site-builder has one `site-builder_build-site` tool. It routes explicit and automatic
  requests through `RebuildManager`, which debounces and enqueues `site-build` jobs.
- The job handler returns environment, route count, errors, and warnings. It emits
  `site:build:completed` only after successful builds.
- Preview and production already have separate output directories and URLs. Preview shows
  public content including drafts; production shows only published public content.
- There is no site-builder-owned projection of requested, queued, running, successful, or
  failed builds suitable for an operator UI.

The workspace should not be implemented by scanning output directories, interpreting the
generic job table in CMS, or treating `site:build:completed` as complete status. Those
approaches lose queued and failed states and make CMS own another plugin's semantics.

## Architecture decisions

### 1. Make the shared CMS contract genuinely multi-workspace

Site is the concrete second consumer of the optional workspace contract proposed in
[cms-publishing-workspace.md](./cms-publishing-workspace.md). Add only the multi-provider
behavior now justified by those two consumers:

```ts
interface CmsWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: string;
  priority: number;
  dataProvider: (request: unknown) => Promise<unknown>;
  actionHandler?: (request: unknown, actor: CmsActor) => Promise<unknown>;
  entityActions?: CmsEntityActionRegistration[];
}
```

The exact schemas remain narrow and Zod-validated through `@brains/plugins`.

The CMS registry must:

- reject duplicate workspace IDs rather than silently replacing a provider;
- sort by `priority`, then `id`, independent of plugin startup order;
- expose serializable descriptors through `GET <cms-route>/api/workspaces`;
- continue to expose provider data and actions through
  `GET/POST <cms-route>/api/workspaces/:id`;
- return the resolved deep link, such as `<cms-route>#/workspaces/site`, from successful
  registration;
- subscribe during CMS `onRegister`; providers register during `onReady`;
- treat a missing CMS registration handler as a valid, non-fatal result.

The CMS bundle owns the `site` and `publishing` renderer names. Registration never ships
runtime React code to the browser.

### 2. Add a site-builder-owned build snapshot

Define strict Zod schemas inside site-builder for a browser-safe projection:

```ts
interface SiteWorkspaceSnapshot {
  site: {
    title: string;
    previewUrl?: string;
    liveUrl?: string;
  };
  automation: {
    autoRebuild: boolean;
    debounceMs: number;
    defaultEnvironment: "preview" | "production";
  };
  environments: Array<{
    environment: "preview" | "production";
    active?: {
      jobId?: string;
      state: "debouncing" | "queued" | "building";
      requestedAt: string;
      startedAt?: string;
    };
    lastSuccess?: {
      jobId: string;
      completedAt: string;
      routesBuilt: number;
      warnings: string[];
    };
    lastFailure?: {
      jobId: string;
      completedAt: string;
      message: string;
    };
  }>;
  recentBuilds: Array<{
    jobId: string;
    environment: "preview" | "production";
    outcome: "succeeded" | "failed";
    completedAt: string;
    routesBuilt?: number;
    warnings?: string[];
    message?: string;
  }>;
  routes: Array<{
    id: string;
    path: string;
    title: string;
  }>;
}
```

Do not expose output directories, working directories, stack traces, or secret-bearing
configuration.

Use the shell runtime-state namespace for safe build results. This is disposable
operational state, not durable authored content, so it must not become a markdown entity.
Keep the last success/failure facts per environment plus at most five recent terminal
results rather than an unbounded build history.

The build-status service must:

- record `debouncing` when `RebuildManager` accepts a request;
- record the job ID and `queued` state after enqueue;
- record `building` from the job handler before rendering;
- record success, warnings, route count, and completion time, trimming recent results to
  five;
- record failures from both failed build results and thrown job errors;
- reconcile a stored active job ID through `context.jobs.getStatus()` after restart;
- clear a stale pre-enqueue debounce on startup instead of claiming a build is still
  pending;
- serve the same snapshot to tools or future Dashboard summaries rather than creating a
  second status interpretation.

The generic job queue remains the execution authority. The site-builder projection gives
that authority domain meaning and preserves the most recent operator-safe result.

### 3. Provider-owned actions through CMS-owned transport

Register two site actions:

```ts
type SiteWorkspaceAction =
  { action: "build-preview" } | { action: "build-production"; confirmed: true };
```

Both actions require an active operator session. CMS derives the actor and `anchor`
permission context on the server; site-builder validates and authorizes the action.

Both actions use `RebuildManager.requestBuild()` so tools, auto-rebuild, and CMS keep the
same debounce and deduplication behavior. The CMS must not enqueue a `site-build` job
directly.

A production request has an explicit confirmation dialog naming the live URL and
published-only content scope. The server rejects a production request without
`confirmed: true`. This is an intentional-side-effect guard, not a claim that the site
builder provides transactional deployment or rollback.

Return an accepted state immediately and let the workspace query refetch while an active
build exists. Do not invent percentage progress when the current job projection only
supports lifecycle states.

### 4. Site workspace product shape

Register the workspace as:

- ID: `site`;
- label: **Site**;
- renderer: CMS-owned `site`;
- navigation group: CMS-owned **Operations**;
- ordered after Publishing when both are present.

The desktop workspace contains:

- site title and builder/auto-rebuild status;
- paired **Preview** and **Live** environment panels;
- environment scope: preview includes public drafts, live includes published public
  content only;
- last successful build time, route count, warnings, and failure summary;
- **Build preview**, **Update live site**, and available open-URL actions;
- an active-build state with an indeterminate activity treatment;
- a compact registered-route inventory;
- read-only automation facts and a link to the normal Site info entity editor when that
  entity exists.

On tablet and phone, workspaces join the existing horizontal CMS destination switcher.
Environment panels stack, action targets retain the console touch size, and failures appear
before route inventory.

The first slice does not add a full build log or log streaming. The UI may show the current
operation, last success/failure facts, and at most five recent terminal results because
those are the bounded canonical records.

### 5. Contextual entity links are additive

After the workspace is stable, site-builder may register read-only entity links:

- **Open preview** when a preview URL can be generated;
- **Open live** only for content eligible for production and with a resolvable live URL.

Generate URLs in site-builder from the registered entity display/route rules. CMS must not
reimplement pluralization or URL generation. These links belong in a small **Website**
block in the editor colophon and remain separate from Save and Publishing actions.

Do not block the first Site workspace release on contextual links if URL eligibility cannot
be represented without widening the contract.

### 6. Keep configuration and deployment out of the workspace

The workspace is an operational control surface, not a general site-builder admin panel.
Do not expose editing for:

- output or working directories;
- theme CSS or package resolution;
- layouts, templates, static assets, or route definitions;
- domains, certificates, DNS, or deploy-provider credentials;
- auto-rebuild policy in the first slice.

Site info remains schema-derived entity content. Structural site and theme configuration
remains app configuration. Fleet deployment remains an ops concern.

### 7. Add a compact, read-only Dashboard digest

Site health is cross-cutting runtime status, so site-builder also registers an
anchor-visible Dashboard widget when Dashboard is installed. This is not a second Site
workbench.

The widget consumes the same `SiteWorkspaceSnapshot` and shows only:

- preview and live lifecycle state;
- last successful live update and route count;
- an active build or current unresolved failure;
- available **Open preview** and **Open live** links;
- **Manage in CMS →** only when workspace registration returned a URL.

Register it in the Dashboard `site` group with a digest and `needsOperator` derived from
the latest environment outcomes. A currently building site is informative, not an
attention item. A failed latest outcome requires attention until a later success for that
environment.

Do not place Build preview or Update live site controls on Dashboard in the first slice.
Dashboard has a public-readable route with permission-filtered widgets; adding mutations
would require another authenticated action transport and duplicate CMS confirmation UI.
Build controls remain in CMS, tools, and chat.

## Implementation phases

### Phase 1 — Multi-workspace CMS foundation

1. Expand the workspace contract from the publishing plan with `priority`, descriptor
   listing, duplicate-ID rejection, and deterministic ordering.
2. Add the authenticated workspace-list route and CMS query key.
3. Add URL parsing for `#/workspaces/:id` without changing existing entity deep links.
4. Render all registered workspaces under Operations using CMS-owned renderer names.
5. Test zero, one, and two registrations in both provider startup orders.

Gate: CMS-only behavior is unchanged; Publishing and Site test providers can coexist
without importing one another.

### Phase 2 — Canonical site build status

1. Add `SiteBuildStatusService` and schemas under site-builder.
2. Back the bounded environment records with `context.runtimeState`.
3. Connect `RebuildManager` request/enqueue transitions and job-handler start/result/error
   transitions.
4. Reconcile stored active job IDs after restart.
5. Add a snapshot provider that combines build state, resolved metadata/URLs, automation
   config, and route-registry data.
6. Characterize tool and auto-rebuild behavior to ensure the status work does not change
   debounce or job semantics.

Gate: preview and production snapshots accurately show request → queued → building →
success/failure, including restart reconciliation.

### Phase 3 — Site registration and CMS renderer

1. Register `site` from site-builder during `onReady` and retain the returned CMS URL.
2. Implement snapshot and action handlers with Zod validation and actor authorization.
3. Add the CMS Site renderer, typed client methods, and query invalidation/polling while a
   build is active.
4. Add preview/live cards, open links, route inventory, automation facts, empty state, and
   operator-safe failure display.
5. Add the production confirmation dialog and verify the server rejects unconfirmed
   requests.
6. Implement tablet and phone layouts following the existing CMS destination switcher.

Gate: an operator can build preview, inspect success/failure, open it, confirm a live
update, and see both environments settle without refreshing the app.

### Phase 4 — Dashboard Site health digest

1. Register an anchor-visible `SiteHealthWidget` from site-builder only when Dashboard is
   installed.
2. Derive widget data, digest lines, and `needsOperator` from the canonical site snapshot.
3. Render preview/live health, current activity or failure, open links, and last live
   result without build controls.
4. Include **Manage in CMS →** only when CMS workspace registration returned a URL.
5. Test Dashboard with site-builder absent, CMS absent, and both optional plugins present.

Gate: Dashboard gives an accurate site-health glance without becoming another management
surface or probing CMS routes.

### Phase 5 — Contextual links and composition polish

1. Add preview/live entity links where site-builder can prove a route.
2. Link Site info to its existing singleton editor rather than embedding a second form.
3. Verify Publishing and Site ordering, badges, deep links, browser back/forward behavior,
   and direct page reloads.
4. Confirm site-builder removal leaves Publishing, Dashboard, and ordinary CMS routes
   intact.

Gate: all supported compositions have useful navigation and no dormant controls.

### Phase 6 — Application verification and release

1. Start the full Rover test app with `cd brains/rover && bun start:full`.
2. Trigger preview and production builds on the running app through the CMS actions.
3. Verify generated preview and production output using the app-managed rebuild flow.
4. Exercise success, warning, thrown failure, duplicate request, restart reconciliation,
   absent CMS, absent Dashboard, and absent site-builder cases.
5. Compare Dashboard health with CMS after each build transition.
6. Add package changesets and update operator documentation.

Gate: Dashboard, CMS, site-builder tools, runtime status, and generated output agree for
both environments.

## Validation

Targeted checks:

- `bun run --filter @brains/plugins typecheck`
- `bun run --filter @brains/plugins test`
- `bun run --filter @brains/site-builder-plugin typecheck`
- `bun run --filter @brains/site-builder-plugin test`
- `bun run --filter @brains/cms typecheck`
- `bun run --filter @brains/cms test`
- `bun run --filter @brains/dashboard typecheck`
- `bun run --filter @brains/dashboard test`
- `bun scripts/lint.mjs --force --filter @brains/plugins --filter @brains/site-builder-plugin --filter @brains/cms --filter @brains/dashboard`
- `bun run docs:check`

Application checks:

- CMS only: no Operations group;
- CMS + publishing: Publishing only;
- CMS + site-builder: Site only;
- CMS + both: Publishing then Site, with stable deep links;
- Dashboard + site-builder: compact Site health derived from the same snapshot;
- Dashboard + site-builder without CMS: health remains useful with no broken management
  link;
- preview build includes public drafts and excludes restricted content;
- production build includes published public content only;
- missing preview/live URLs hide only their corresponding open action;
- production cannot be requested from CMS without explicit confirmation;
- failures expose a safe message and preserve the previous successful build fact;
- site-builder continues to work through tools and auto-rebuild when CMS is absent.

## Risks and mitigations

- **CMS becomes a site-builder client:** keep transport and renderer generic; all build
  schemas and semantics remain in site-builder.
- **Stored status lies after a restart:** persist job IDs and reconcile them through the job
  namespace; clear unrecoverable debounce state.
- **Production build is mistaken for deployment:** use “Update live site,” describe the
  production output precisely, and do not add provider/deploy claims.
- **Preview leaks restricted content:** preserve the current public visibility scope;
  preview differs only by including drafts.
- **Two providers race during startup:** subscribe in CMS registration, register providers
  on ready, sort independently of arrival order, and test both orders.
- **Browser receives internal paths or stack traces:** shape a strict safe snapshot and test
  serialization boundaries.
- **Build controls diverge from tools:** route every request through `RebuildManager`.
- **Dashboard and CMS disagree:** derive both from the same snapshot and test each build
  transition on both surfaces.
- **Dashboard becomes a duplicate workbench:** keep it read-only and link to CMS for
  management.
- **Operations overwhelm mobile navigation:** use the existing horizontal destination
  switcher and attention badges; do not add a second navigation system.

## Non-goals

- A visual page builder or live DOM editor.
- Editing themes, routes, layouts, templates, or build directories.
- DNS, TLS, deployment-provider, or rollback management.
- Arbitrary plugin-supplied browser components.
- Unbounded build history or log streaming.
- Exact percentage progress before the job contract can report it accurately.
- Moving content-pipeline publication controls into Site.
- Adding duplicate build controls to Dashboard.

## Success criteria

- Site appears automatically only when CMS and site-builder are both installed.
- Publishing and Site coexist as independent optional workspaces.
- Dashboard reports Site health whenever Dashboard and site-builder are present, with a
  CMS link only when resolvable.
- Preview and production state comes from one site-builder-owned snapshot on every
  surface.
- Preview and live actions use the same rebuild path as tools and auto-rebuild.
- Production updates require explicit confirmation and name the target URL.
- Site info and authored sections remain ordinary CMS entities.
- Removing either optional provider leaves the remaining CMS behavior intact.
- No browser response exposes internal output paths, secrets, or raw stack traces.
