# @rizom/brain

Canonical brain runtime and CLI.

## Quick start

```bash
bun add -g @rizom/brain
brain init my-brain --recipe personal
cd my-brain
# set AI_API_KEY in .env
brain start
```

## Canonical configuration

```yaml
brain: brain
anchor: person
kind: professional
bundles:
  - core
  - site
  - publishing
plugins:
  directory-sync:
    seedContentPath: ./seed-content
```

The fixed bundles are `core`, `site`, `publishing`, and `team`. `minimal`, `personal`, `team`, and `commerce` recipes expand to explicit YAML during scaffolding and have no runtime meaning.

## Commands

| Command                                | Purpose                                                |
| -------------------------------------- | ------------------------------------------------------ |
| `brain init <dir> --recipe <name>`     | Scaffold an instance                                   |
| `brain start`                          | Start the configured brain                             |
| `brain chat`                           | Start with terminal chat                               |
| `brain eval`                           | Run structural/model evaluation tooling                |
| `brain config migrate`                 | Preview a retired built-in config as canonical bundles |
| `brain migrate binary-assets`          | Migrate local binary rows into durable asset storage   |
| `brain assets reconcile`               | Restore missing assets from synced binary files        |
| `brain diagnostics <subcommand>`       | Inspect runtime diagnostics                            |
| `brain cert:bootstrap`                 | Create an origin certificate                           |
| `brain secrets:push`                   | Push declared secrets                                  |
| `brain auth reset-passkeys --yes`      | Reset local passkey state                              |
| `brain auth reinitialize-access --yes` | Reapply exact access grants                            |
| `brain help`                           | Show CLI help                                          |

Commands exposed by plugins are discovered from the running tool registry.

## Requirements

- Bun 1.3.3+
- a configured provider API key

## Public authoring surfaces

- `@rizom/brain` — definition and bundle contracts
- `@rizom/brain/model` — canonical definition
- `@rizom/brain/plugins`, `/entities`, `/services`, `/interfaces`
- `@rizom/site` for site authoring; `@rizom/brain/templates` and `@rizom/brain/deploy` for advanced consumers

## Documentation

- [Getting Started](./docs/getting-started.md)
- [CLI Reference](./docs/cli-reference.md)
- [brain.yaml Reference](./docs/brain-yaml-reference.md)
- [External Plugin Authoring](../../docs/external-plugin-authoring.md)

## License

AGPL-3.0-only
