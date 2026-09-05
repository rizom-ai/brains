---
"@brains/admin": minor
"@brains/sdk": minor
---

Migrate `@brains/admin` to the declarative surface, and with it the last
package that reached for `getActiveAuthService()`.

**Administration is one workspace with four tabs.** People, Invitations,
Peers and Audit were four Studio registrations this package loaded and
stitched by hand — a data provider per child, actions routed by id, and a
hand-rolled guard against nested tabs. They are now tabs of one declared
workspace: each is a loader, their actions are the workspace's actions, and
`aliases` keeps links to the old ids working. About 120 lines of stitching
are gone, along with the `createBuiltInStudioWorkspaceRegistration` and
`registerBuiltInDashboardWidget` imports, both shell-internal.

**Workspace and alias ids are package-scoped**, as every converted package's
are: `admin:administration` becomes `@brains/admin:admin:administration`.

The service `setup` context gains `auth`, so a package whose every surface
administers auth resolves it once into state rather than per call. A brain
without auth-service registers no administration at all, which is what the
old `studio.isAvailable()` bail did less directly.

`AnyWorkspaceActionDefinition` is published for packages that compose
workspace actions.
