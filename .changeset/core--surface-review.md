---
"@brains/sdk": minor
"@brains/unified-inbox": patch
---

The stable surface is what a package outside this repo would use

Reading all 434 stable names entry by entry found three groups that were
promised as patch-stable authoring without being either.

Nineteen host names — the Studio and Dashboard registration messages, the
renderer ids, the `Runtime*` view shapes and `PermissionService` — have no
consumer outside Studio and Dashboard themselves, which the accepted plan keeps
internal. Sixteen inbox schemas had one consumer: unified-inbox, re-exporting
its own vocabulary through the SDK. `internalFullScope` says in its name what it
is, and its consumer is infrastructure. All are advanced contracts now.

`DataSource`, `BaseDataSourceContext` and `DataSourceSchema` move to the
advanced entry, where the entity service their context carries is expected.
unified-inbox, which implements a data source by hand rather than declaring one,
imports them from there.

The published-surface check also now reads the entity declarations, which it had
never covered, and reads the export list rather than the file text — a bundled
declaration file carries whole modules, so a private interface can sit in it
unreachable, and what an author can actually name is the export list.
