# Plan: External Plugin API

## Open work

External developers still cannot build and load full plugins against `@rizom/brain`.

The remaining work breaks into five parts.

### 1. Expand the public library surface for plugin authors

The package still needs a curated plugin-authoring surface beyond the existing standalone site/theme exports.

Needed public subpaths:

- `@rizom/brain/plugins`
- `@rizom/brain/entities`
- `@rizom/brain/services`
- `@rizom/brain/interfaces`
- `@rizom/brain/utils`
- `@rizom/brain/templates`

Requirements:

- each subpath has a deliberate exports contract
- internal shell-only types stay private
- `.d.ts` output remains usable for external authors

### 2. Load external plugins from `brain.yaml`

`brain.yaml` should be able to declare plugins installed from `node_modules`.

Target shape:

```yaml
plugins:
  - @rizom/brain-plugin-calendar
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

Needed behavior:

- resolve plugin entries from `node_modules`
- support config objects per plugin entry
- support env-var interpolation in plugin config
- fail clearly when a declared plugin is missing

### 3. Add a plugin API compatibility contract

External plugins need a versioned contract so breaking changes are detectable.

Needed behavior:

- publish a plugin API version constant
- let plugins declare target API version in `package.json`
- warn on mismatch at load time
- document deprecation and breaking-change policy

### 4. Add basic plugin CLI ergonomics

Optional but useful follow-on CLI work:

- `brain search` for npm plugin discovery
- `brain add` to install and write `brain.yaml`
- `brain remove` to uninstall and remove config

This should only land if it materially improves the operator path.

### 5. Prove the external DX end-to-end

Before calling this done, ship:

- one reference external plugin in a separate repo
- tests proving authoring + loading work end-to-end
- plugin author docs covering setup, config, testing, and publishing

## Non-goals

- publishing every internal `@brains/*` workspace package directly
- plugin sandboxing
- hot reload for plugin code
- a custom plugin marketplace or registry

## Dependencies

- current published `@rizom/brain` package contract

## Done when

1. external plugin authors can import the required public APIs from `@rizom/brain`
2. installed plugins can be declared in `brain.yaml` and loaded at runtime
3. plugin API version mismatches are detectable
4. at least one external reference plugin proves the full path
5. plugin author documentation exists and matches reality
