# Operator Playbook

## Deploy contract files

Treat these as checked-in deploy artifacts in the pilot repo:

- `.env.schema`
- `deploy/kamal/deploy.yml`
- `deploy/scripts/`
- `.github/workflows/build.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/reconcile.yml`

`.env.schema` is the single source of truth for required and sensitive deploy vars.
The deploy scripts and workflows should read from that contract instead of inventing a second list.

The shared pilot image tag is `brain-${brainVersion}`:

- build publishes `brain-${brainVersion}`
- generated `users/<handle>/.env` carries `BRAIN_VERSION=<brainVersion>`
- deploy sets `VERSION=brain-${brainVersion}`

## Version bump flow

When `pilot.yaml.brainVersion` changes and you push:

1. build publishes the new shared image tag
2. reconcile refreshes generated `users/<handle>/.env`
3. deploy runs for handles whose generated config changed
4. generated file commits happen once in a final aggregation step after the deploy matrix finishes

When a push changes only deploy contract files and no generated `users/<handle>/.env` or `users/<handle>/brain.yaml` files, the deploy workflow exits through its explicit no-op path and prints `No affected user configs; skipping deploy.`

They are scaffolded from `@rizom/ops`, then versioned in this repo like any other deploy contract.

## Bootstrap flow

For this fleet, operator-local secret material remains the source of truth during onboarding and rotation. The repo stores encrypted per-user secrets, not raw values.

For a new pilot user, the operator bootstrap order is:

1. `bunx brains-ops age-key:bootstrap <repo> --push-to gh`
2. `bunx brains-ops ssh-key:bootstrap <repo> --push-to gh`
3. `bunx brains-ops cert:bootstrap <repo> --push-to gh`
4. `bunx brains-ops secrets:encrypt <repo> <handle>`
5. `bunx brains-ops onboard <repo> <handle>`

`age-key:bootstrap` keeps a repo-local canonical age identity under `.brains-ops/age/identity.txt`, writes the matching public recipient to `pilot.yaml.agePublicKey`, and can push the private key to GitHub as `AGE_SECRET_KEY`.

The shared cert bootstrap writes local cert artifacts under `.brains-ops/certs/shared/`, which stays repo-local and ignored by git.

Preview hosts use the shape `<handle>-preview.rizom.ai`, so one wildcard origin cert for `*.rizom.ai` covers both the primary and preview hosts for every pilot user.

## Upgrading operator behavior

When `@rizom/ops` changes the scaffolded deploy contract:

1. bump `@rizom/ops` in `package.json`
2. rerun the relevant scaffold/reconcile flow
3. review the resulting changes to `.env.schema`, `deploy/scripts/`, and workflows in git
4. commit the updated deploy artifacts together

## Rover-core verification notes

Rover core is MCP-only. Do not expect the bare domain to serve a website.

Use these checks after deploy:

- `https://<handle>.rizom.ai/health` should return `200`
- unauthenticated `POST https://<handle>.rizom.ai/mcp` should return `401 Unauthorized: Bearer token required`
- a bare `GET /` may also return `401`; that is expected for rover core and does not indicate a bad deploy

## Discord bot token checklist

Use this when enabling Discord for a pilot user.

1. Pick the user handle (for example `smoke`).
2. Open the Discord Developer Portal.
3. Create a **new application** for that user's rover.
4. Add a **Bot** to the application.
5. Copy the bot token.
6. Put that value in `.env` or `.env.local` in this repo as `DISCORD_BOT_TOKEN=...` while onboarding that user.
7. Keep `discord.enabled: true` in `users/<handle>.yaml` unless you explicitly want to disable the primary pilot interface.
8. Encrypt the current per-user secret payload:
   - `bunx brains-ops secrets:encrypt . <handle>`
9. Reconcile/deploy the user or cohort:

- `bunx brains-ops onboard . <handle>`
- or `bunx brains-ops reconcile-cohort . <cohort>`

11. In the Discord Developer Portal, generate an install URL and invite the bot to the right server.
12. Send a test message in Discord and confirm the rover responds.

Notes:

- Use **one bot token per user/rover**.
- Do not reuse the same Discord bot token across multiple pilot users.
- Discord is the default pilot interface moving forward.
- The encrypted `users/<handle>.secrets.yaml.age` file is the durable checked-in deploy input; your local env is only the operator staging source.
- MCP is optional and mainly for direct client access or specific testing workflows.
- When explaining the content workflow, describe it first as a normal **git repo** of **markdown/text files**.
- Position **Obsidian** as optional: it is just one possible editor for those same files, not the default requirement.

## Recovery notes

Document known failure modes, recovery steps, and operator notes here.
