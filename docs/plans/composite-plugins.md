# Plan: Composite Plugins

## Context

Several features require both an EntityPlugin (schema, adapter) and a ServicePlugin (tools, external integrations) that are tightly coupled. Today these are registered as separate entries with separate config blocks, even though they're conceptually one unit.

Examples:

- `entities/newsletter/` + `plugins/buttondown/` — newsletter entity + email sending service
- `entities/agent-directory/` + `plugins/agent-directory/` (proposed) — agent entity + Agent Card fetching

Not every entity + service pair qualifies. `entities/image/` is a shared entity type used by AI generation, stock-photo search, and directory-sync imports — three independent services with unrelated configs. Composites make sense when there's a 1:1 relationship with shared config.

The pain point isn't the two-package split (that's architecturally clean) — it's the two separate config blocks. Buttondown's API key configures the service, but the entity and service are one logical feature with one set of credentials.

## What exists today

Brain definitions use a capabilities array of tuples:

```typescript
capabilities: [
  ["newsletter", newsletterPlugin, {}],
  ["buttondown", buttondownPlugin, { doubleOptIn: true }],
  ["stock-photo", stockPhotoPlugin, {}],
];
```

Each entry: `[id, factory, config]`. Config comes from the tuple or `brain.yaml` overrides keyed by plugin ID.

Presets are arrays of plugin IDs:

```typescript
const pro = [...standard, "newsletter", "buttondown", "stock-photo"];
```

Entity + service coupling happens via messaging (`buttondown:is-configured`, `buttondown:send`) or the shared entity service. No framework support for grouping.

## Proposal

### Composite factory

A factory function that returns multiple plugins from one config:

```typescript
export function newsletter(config: NewsletterConfig = {}) {
  return [
    newsletterPlugin(config),
    buttondownPlugin({
      apiKey: config.apiKey,
      doubleOptIn: config.doubleOptIn,
    }),
  ];
}

export function agentDirectory(config: AgentDirectoryConfig = {}) {
  return [agentEntityPlugin(), agentServicePlugin(config)];
}
```

### Brain definition support

Update `CapabilityEntry` to allow factories that return arrays:

```typescript
// Before: factory must return one Plugin
type CapabilityEntry = [string, PluginFactory, CapabilityConfig];

// After: factory can return one Plugin or Plugin[]
type CapabilityEntry = [
  string,
  PluginFactory | CompositePluginFactory,
  CapabilityConfig,
];
```

In the brain definition:

```typescript
capabilities: [
  // Single plugin (unchanged)
  ["blog", blogPlugin, {}],

  // Composite — one config, multiple plugins
  ["newsletter", newsletter, { apiKey: "${BUTTONDOWN_API_KEY}" }],
  ["agent-directory", agentDirectory, {}],
];
```

Presets stay simple — one ID per composite:

```typescript
const pro = [...standard, "newsletter", "agent-directory"];
```

### Resolver change

`brain-resolver.ts` flattens arrays when building the plugin list:

```typescript
for (const [id, factory, config] of definition.capabilities) {
  const merged = mergeWithOverrides(id, config, env);
  const result = factory(merged);
  // Flatten: factory can return Plugin or Plugin[]
  const plugins = Array.isArray(result) ? result : [result];
  capabilities.push(...plugins);
}
```

One change in one file. The Shell already accepts `Plugin[]` — no changes needed downstream.

### Config in brain.yaml

One override block per composite:

```yaml
plugins:
  newsletter:
    apiKey: ${BUTTONDOWN_API_KEY}
    doubleOptIn: true
  agent-directory:
    # all agent-directory config here
```

The composite factory distributes config to its sub-plugins internally.

## What this does NOT change

- **Plugin base classes** — EntityPlugin and ServicePlugin stay separate. No CompositePlugin base class.
- **Plugin contexts** — EntityPluginContext and ServicePluginContext stay distinct.
- **Messaging** — plugins still communicate via messaging, not shared state.
- **Existing plugins** — single-plugin capabilities work exactly as before.

## Candidates

| Composite         | Entity              | Service                                        | Shared config        |
| ----------------- | ------------------- | ---------------------------------------------- | -------------------- |
| `newsletter`      | newsletter entity   | buttondown (API key, double opt-in)            | API key              |
| `agent-directory` | agent entity        | agent tools (fetch deps)                       | — (no external API)  |
| `social-media`    | social-media entity | publishing service (LinkedIn client, API keys) | Platform credentials |

`social-media` is a candidate but requires a split-then-composite: the LinkedIn client and publish handlers currently live inside the EntityPlugin at `entities/social-media/`. They'd need to be extracted into a ServicePlugin first, then composited. Larger refactor than the others.

**Not candidates:** `image` + `stock-photo` — the image entity is shared across AI generation, stock-photo search, and directory-sync imports. Three independent services with unrelated configs. Composites only make sense for 1:1 entity-service relationships.

## Steps

1. Update `CapabilityEntry` type in brain definition to accept `Plugin | Plugin[]` returns
2. Update `brain-resolver.ts` to flatten arrays (one line)
3. Migrate `newsletter` + `buttondown` to a composite factory as proof of concept
4. Apply to `agent-directory` when that feature ships

## Files affected

| Step | Files | Nature                                                             |
| ---- | ----- | ------------------------------------------------------------------ |
| 1-2  | ~2    | Type definition, resolver flatten logic                            |
| 3    | ~3    | Composite factory, rover capabilities update, config consolidation |
| 4    | ~2    | Factory function, rover update                                     |

## Verification

1. Existing single-plugin capabilities still work unchanged
2. `newsletter` composite registers both entity and service plugin from one config
3. `brain.yaml` override with one `newsletter:` block configures both
4. Presets reference one ID per composite
5. `bun run typecheck` / `bun test` pass throughout
