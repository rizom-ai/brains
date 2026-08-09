# Public authoring `0.2` golden packages

These six standalone packages define the accepted external-author experience for the
stable `0.2.x` API:

| Package             | Purpose                                                     | Activation phase |
| ------------------- | ----------------------------------------------------------- | ---------------- |
| `entity`            | Schema-first entities and a typed projection                | Phase 2          |
| `service`           | Parsed config, setup state, a typed tool, and a durable job | Phase 3          |
| `site`              | One-import schema-first site authoring                      | Phase 4          |
| `interface`         | Authenticated route, typed enqueue, and supervised daemon   | Phase 5          |
| `message-interface` | Conversational and outbound message transport               | Phase 5          |
| `brain-definition`  | Root `use()` and bundle composition canary                  | Phase 1          |

Phases 1–5 now compile and exercise every fixture against packed local artifacts. The
fixtures remain source-first contracts: do not rewrite a golden package to fit an older
class-based or registry-based API.

The fixtures intentionally contain no workspace imports, direct Zod dependency, source
manifest import, package metadata in TypeScript, cast, process-role branch, registry
call, queue type, or fully qualified capability name. Each package carries a
self-contained `tsconfig.json` — no `extends` into the monorepo — because these sources
must build unchanged after they are packed and installed outside the repository.

The `>=0.2.0-alpha.0 <0.3.0` brain peer range remains a placeholder until the
complete API is published. Phase 6 pins every fixture to the nominated alpha and
advances the fixture manifests and the golden test's `placeholderBrainPeerRange`
together.

The registry matrix is intentionally opt-in so ordinary tests never depend on npm
availability. It installs exact nominated versions, rebuilds and packs all six packages,
then boots their composed brain outside the monorepo:

```bash
RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1 \
RIZOM_PUBLIC_API_BRAIN_VERSION=0.2.0-alpha.N \
RIZOM_PUBLIC_API_SITE_VERSION=0.2.0-alpha.N \
bun test packages/brain-cli/test/public-authoring-registry-packed.test.ts
```

The test also verifies installed versions, licenses, declarations, export maps, and the
absence of removed site authoring contracts. It refuses ranges and requires every golden
Brain peer lower bound to equal the nominated alpha.

`export-ledger.json` is the Phase 0 export decision record. Every current authoring export
is classified exactly once as stable, advanced-with-consumer, or internal/removable. There
is no compatibility-facade category: alpha aliases and class-first APIs must disappear
before stable. Planned symbols used by these golden packages already appear in their
intended category even when the current alpha does not export them yet. Later phases must
change implementation exports and this ledger together.
