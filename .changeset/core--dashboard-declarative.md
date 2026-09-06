---
"@brains/dashboard": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
---

Migrate `@brains/dashboard` to the declarative surface. The package is one `defineServicePlugin` (`dashboard`) importing `@brains/sdk`, `@brains/contracts`, `@brains/console-theme`, `@brains/operator-view-react` and `@brains/utils`; `DashboardPlugin` is deleted. The two widget-registration handlers are `defineSubscription` with payload schemas, the page and console-jump routes and every asset file are `defineRoute`, the aggregate is declared in `dataSources`, and the way in is declared in `interactions`.

**The console no longer reads the route table.** Finding Studio and Chat used to mean scanning every mounted route and matching plugin ids. `surfaces` joins the service setup context — the same read the interface families already had, named consumer `@brains/dashboard` — so the runtime answers which consoles are mounted and what each requires, and the dashboard says who is asking. Session resolution goes through `auth` on the setup context rather than a module-level global.

`@brains/sdk/services` gains what hosting declared widgets needs, with `@brains/dashboard` as the named consumer: `DECLARATIVE_DASHBOARD_WIDGET_RENDERER`, `PermissionService`, `UserPermissionLevelSchema`, `safeParseRuntimeDashboardWidgetData`, `defineDataSource`, and the shapes a declaration produces — `AnyDataSourceDeclaration`, `AppInfo`, `ConsoleSurface`, `DashboardDigestLine`, `DashboardWidgetProviderContext`, `EntityCount`, `InteractionInfo`, `RuntimeDashboardOperatorPanelBlock`, `RuntimeOperatorActionControl`, `RuntimeOperatorLaunchIntent`, `RuntimeOperatorLinkTarget`, `RuntimeStudioWorkspaceData` and `SurfacePermissionLevel`.

Two things change for a brain. The runtime plugin id is `@brains/dashboard:dashboard`, which is what its routes now register under; the capability id in configuration is still `dashboard`. And the dashboard no longer registers an endpoint beside its interaction — the two named the same door, and the page already dedupes by path, so nothing it renders changes.
