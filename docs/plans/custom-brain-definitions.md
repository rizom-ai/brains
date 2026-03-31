# Plan: Custom Brain Definitions (brain.ts)

> **Status:** Long-term. Requires YAML-based plugin system (npm-packages Phase 3) to ship first.

## Goal

For power users who need full programmatic control — custom plugin logic, preset composition, inline plugins — beyond what YAML config supports.

## How it works

```
mybrain/
  brain.yaml          # still the entry point
  brain.ts            # custom definition (optional — only if extending)
  package.json        # dependencies (only if brain.ts exists)
  node_modules/       # auto-installed
  .env
```

```yaml
# brain.yaml — switch to programmatic mode
brain: ./brain.ts
```

```typescript
// brain.ts
import { defineBrain, rover } from "@rizom/brain";
import { calendarPlugin } from "@rizom/brain-plugin-calendar";
import { stripePlugin } from "./plugins/stripe";

export default defineBrain({
  ...rover.pro, // extend an existing model preset
  capabilities: [
    ...rover.pro.capabilities,
    ["calendar", calendarPlugin, {}],
    ["stripe", stripePlugin, { apiKey: "${STRIPE_API_KEY}" }],
  ],
});
```

`brain start` detects `brain.ts`, resolves imports via `node_modules`, and boots in-process. No separate build step — Bun runs TypeScript directly.

## New API surface

`rover.pro` as a spread target requires exporting preset capabilities as composable arrays. Today presets are internal string arrays of plugin IDs — we'd need to export them as resolved `[id, factory, config]` tuples. This is the `definePreset()` API: each preset becomes an importable object with `capabilities` and `interfaces` arrays.

## Composites

A composite plugin returns multiple plugins from one factory (see `docs/plans/composite-plugins.md`). This works identically for external plugins:

```typescript
// @rizom/brain-plugin-ecommerce
import { EntityPlugin, ServicePlugin } from "@rizom/brain";

const productEntity = EntityPlugin.create({ ... });
const shopService = ServicePlugin.create({ ... });

export function ecommerce(config) {
  return [productEntity(config), shopService(config)];
}
```

```typescript
// brain.ts
import { ecommerce } from "@rizom/brain-plugin-ecommerce";

capabilities: [["ecommerce", ecommerce, { shopifyKey: "${SHOPIFY_KEY}" }]];
```

## When to use brain.ts vs brain.yaml

| Use case                         | brain.yaml          | brain.ts              |
| -------------------------------- | ------------------- | --------------------- |
| Built-in model                   | `brain: rover`      | not needed            |
| Add npm plugins                  | `plugins:` list     | not needed            |
| Plugin config with env vars      | `${STRIPE_API_KEY}` | not needed            |
| Extend a preset programmatically | —                   | `...rover.pro` spread |
| Inline custom plugin logic       | —                   | write plugin in-place |
| Conditional capabilities         | —                   | `if (env) { ... }`    |

Most users never need `brain.ts`. It's the escape hatch when YAML isn't enough.
