# Getting Started

## What is a Brain?

A brain is a private AI runtime whose durable knowledge is markdown. One canonical definition supplies the capability catalog; each instance selects explicit bundles and keeps identity, content, site, theme, permissions, and integrations visible in `brain.yaml`.

## Prerequisites

- Bun 1.4.0 or newer
- an API key supported by the configured AI provider

## Quick start

```bash
bun add -g @rizom/brain
brain init my-brain --recipe personal
cd my-brain
# edit .env and set AI_API_KEY
brain start
```

`AI_API_KEY` is the only required variable. On first start the brain prints a one-time `/setup` link in the terminal; open it to register your passkey.

To receive setup links and invitations by email instead, set `SETUP_EMAIL_TO` (the address to send the first setup link to), `SETUP_EMAIL_API_KEY` (a Resend API key), and `SETUP_EMAIL_FROM` (a verified Resend sender). The personal, professional, and team recipes wire these into `brain.yaml`; with them unset, team members are added through Admin → Add a person with a manual invite link.

`brain init` writes explicit bundle selection. Recipes are compile-time scaffolding only.

## Recipes

```bash
brain init headless-brain --recipe headless
brain init personal-brain --recipe personal
brain init professional-brain --recipe professional
brain init team-brain --recipe team
```

| Recipe         | Canonical selection                                                              |
| -------------- | -------------------------------------------------------------------------------- |
| `headless`     | `core`                                                                           |
| `personal`     | `core`, `media`, `web`, `chat`                                                   |
| `professional` | `core`, `media`, `automation`, `web`, `chat`, `site`, `publishing`, `federation` |
| `team`         | `core`, `media`, `automation`, `web`, `chat`, `site`, `team`, plus `docs`        |

Each recipe also copies instance-owned starter content into `seed-content/`.

## What `brain init` creates

- `brain.yaml` — explicit bundles and instance overrides
- `seed-content/` — recipe-owned first-boot markdown
- `package.json` — pinned `@rizom/brain` dependency
- `.env.example` and `.env.schema` — environment contract
- `.gitignore` and `tsconfig.json`
- `src/site.tsx` and `src/theme.css` for site-enabled recipes
- optional deployment files with `--deploy`

## Init options

```text
--recipe <name>        headless | personal | professional | team
--domain <domain>      defaults to {directory}.rizom.ai
--content-repo <repo>  owner/name or github:owner/name
--backend <name>       secret backend; default none
--ai-api-key <key>     writes the initial local .env
--deploy               include deployment scaffolding
--regen                regenerate derived deployment files
--no-interactive       disable prompts
```

## Configuration

A personal instance starts with YAML like:

```yaml
brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles:
  - core
  - media
  - web
  - chat
plugins:
  directory-sync:
    seedContentPath: ./seed-content
  auth-service:
    setupEmail: ${SETUP_EMAIL_TO}
  notifications:
    defaultRecipient:
      type: email
      address: ${SETUP_EMAIL_TO}
  email:
    transport: resend
    apiKey: ${SETUP_EMAIL_API_KEY}
    from: ${SETUP_EMAIL_FROM}
```

See [brain.yaml Reference](./brain-yaml-reference.md) for all fields.

## Common next steps

- add a content repository with `plugins.directory-sync.git`;
- configure Discord or another interface;
- customize local site and theme files;
- run `brain cert:bootstrap` and `brain secrets:push` before deployment;
- use `brain config migrate` to preview an old configuration before applying it.
