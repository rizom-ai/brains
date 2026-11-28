---
title: "brain.yaml Reference"
section: "Run a brain"
order: 110
slug: "brain-yaml-reference"
description: "The main configuration file"
---

# brain.yaml Reference

`brain.yaml` is the instance-owned configuration for the canonical brain. It selects fixed capability bundles and applies explicit instance overrides. It does not select a built-in model or preset.

## Example

```yaml
brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
domain: example.com

bundles:
  - core
  - media
  - automation
  - web
  - chat
  - site
  - publishing
  - federation

add:
  - docs
remove:
  - newsletter

site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"

admins:
  - "discord:123456789"
anchors:
  - "discord:123456789"

plugins:
  directory-sync:
    seedContentPath: ./seed-content
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

## Canonical selection

### `brain`

Optional for the canonical definition. These are equivalent:

```yaml
brain: brain
```

```yaml
brain: "@rizom/brain/model"
```

When omitted, the runtime uses the canonical definition. The generated Kamal deploy still needs it: its config step reads `brain` and `domain` from `brain.yaml` and fails when either is missing, so keep the `brain: brain` line that `brain init` writes.

A scoped package name selects an external definition instead (see [Plugins](#plugins)). Bare legacy names and internal `@brains/*` definition packages are rejected.

### `bundleContract`

Required by the canonical definition:

```yaml
bundleContract: capability-bundles-v1
```

The contract is separate from the bundle IDs because names such as `core` and `site` existed before the capability taxonomy with different meanings. The runtime rejects a missing or different contract before bundle resolution, preventing an old `brain.yaml` from silently changing behavior under a new image.

### `bundles`

Required for the canonical definition. Select one or more fixed bundles:

| Bundle       | Members                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`       | `profile`, `prompt`, `conflict`, `style-guide`, `directory-sync`, `note`, `refined-note`, `link`, `topics`, `unified-inbox`, `mcp`, `a2a`, `agents` |
| `media`      | `document`, `image`                                                                                                                                 |
| `automation` | `playbooks`, `onboarding`                                                                                                                           |
| `web`        | `auth-service`, `admin`, `dashboard`, `studio`, `webdav`                                                                                            |
| `chat`       | `chat`, `web-chat`, `ask-content`, `email`, `notifications`, `conversation-memory`, `faq`                                                           |
| `site`       | `site-info`, `site-content`, `site-builder`, `form`, `analytics`                                                                                    |
| `publishing` | `blog`, `series`, `portfolio`, `decks`, `content-pipeline`, `social-media`, `newsletter`, `stock-photo`                                             |
| `federation` | `atproto`, `references`                                                                                                                             |
| `matrix`     | `matrix-server`, the brain's own Matrix homeserver at its domain                                                                                    |
| `team`       | no members; shared-memory and trusted-collaboration policy over members selected elsewhere                                                          |

In short: `core` is identity, markdown knowledge, conflicts, the Inbox, MCP stdio, A2A, and agent discovery; `web` is authentication, Admin, Dashboard, Studio, and the WebDAV drive; `chat` is platform chat (Discord, Slack, Matrix), web chat and public Ask, email, notifications, conversation memory, and FAQ capture; `federation` is AT Protocol publication and references to what other brains publish. The lexicon registry (`atproto-registry`) is in no bundle.

Bundle effects compose in canonical definition order, not YAML list order.

```yaml
bundles:
  - core
  - media
  - automation
  - web
  - chat
  - site
  - team
add:
  - docs
```

### `add` / `remove`

Adjust individual catalog members after bundle composition. `remove` closes that member's config, permissions, instructions, and eval contributions.

These catalog members belong to no bundle and are selected only with `add`: `action-board`, `assessment`, `atproto-registry`, `book`, `contact`, `docs`, `email-workflows`, `guides`, `linkedin-import`, `oauth-broker`, `quiz`, `seminar`, and `wishlist`.

```yaml
add:
  - assessment
remove:
  - analytics
```

Arrays are replaced explicitly; the runtime does not generically merge arrays.

## Identity and runtime fields

### `anchor`

Select the instance's anchor profile flavor:

```yaml
anchor: person # person | team | organization
```

### `name`

Override the runtime instance name.

### `kind`

Select an optional semantic profile kind from the composed catalog: `professional`, `team`, or `organization`. The `personal` and `professional` recipes select `professional`, the `team` recipe selects `team`, and `headless` sets no kind; omit `kind` only when the base profile fields are sufficient. `anchor` controls ownership flavor, while `kind` selects the validated profile field extension.

### `domain`, `port`, `database`

Override deployment domain, production port, or database URL. `port` is the port the brain's HTTP host listens on (default `8080`); the preview site shares it.

### `http`

How the runtime serves HTTP. Every field is optional.

```yaml
http:
  enabled: true # default: whether a selected bundle hosts HTTP (web, matrix)
  preview: true # default: whether a site builder runs
  hostname: 127.0.0.1 # bind address; default: all interfaces
  productionDistDir: ./dist/site-production # only for a site no site builder writes
  previewDistDir: ./dist/site-preview
  sharedImagesDir: ./dist/images
```

A site builder's own output directories are the ones served; an `http` directory that names another one is refused at start. `plugins.webserver` and `add`/`remove: [webserver]` are retired and refused.

### `model`

Select the AI text model. This field is unrelated to the retired built-in brain models.

```yaml
model: anthropic:claude-haiku-4-5-20251001
reasoningEffort: low
```

An explicit `provider:` prefix selects the provider; a bare name is matched to one. Supported providers are `anthropic`, `openai`, `google` and `local` (the model runtime, below); any other prefix fails config validation.

### `embeddingModel`

Select the model that builds the semantic index. Defaults to `openai:text-embedding-3-small`; `openai:text-embedding-3-large` and `local:embeddinggemma-2:270m` are also supported, and any other model fails config validation.

```yaml
embeddingModel: openai:text-embedding-3-large
```

A `local:` model is served by the model runtime at `modelRuntime.url`: any server that implements the OpenAI-compatible `/v1/embeddings` API, such as Ollama. A `local:` model without `modelRuntime.url` fails config validation.

```yaml
embeddingModel: local:embeddinggemma-2:270m
modelRuntime:
  url: http://localhost:11434
```

A deployed brain needs no `modelRuntime.url`: when `brain.yaml` names a `local:` model, the generated Kamal deploy pulls it into `/opt/brain-models` on the server, runs a `models` accessory beside the brain and gives the brain its address. The accessory is Ollama `0.40.18` with `OLLAMA_CONTEXT_LENGTH=32768`. The deploy pulls the `local:` models named as `model`, `embeddingModel`, `answerModel`, and `visionModel`; a `local:` `imageModel` is not pulled (see below). A brain without a `local:` model deploys without the accessory.

To run EmbeddingGemma 2 on a development machine:

```sh
ollama pull embeddinggemma-2:270m
ollama serve
```

A `local:` text model (`model: local:qwen3:14b`) needs the runtime to serve a context long enough for agent prompts, which run to about 28k tokens; Ollama's default cuts them silently. A brain whose `model` and `embeddingModel` are both `local:` starts without a provider key.

```sh
ollama pull qwen3:14b
OLLAMA_CONTEXT_LENGTH=32768 ollama serve
```

Vectors from different models cannot be compared, so changing `embeddingModel` drops the index at the next start and re-embeds every entity. Chat waits for the index to be ready; switching back is the same config change and rebuilds again.

### `answerModel`

A `local:` model that writes while `model` chooses the tools: it answers tool results and runs every generation that chooses no tools, such as background derivations and content drafts. A reasoning model makes the calls and a fast model writes; on a local runtime this cuts most of a turn's time and keeps background work from holding the runtime. It must be a `local:` model, and the deploy pulls it with the others.

```yaml
model: local:qwen3.6:35b
answerModel: local:qwen3:30b-a3b-instruct-2507-q4_K_M
embeddingModel: local:embeddinggemma-2:270m
modelRuntime:
  url: http://localhost:11434
```

Without `answerModel`, a local `model` answers tool results with its reasoning switched off.

### `visionModel`

A `local:` model that sees images. For a local `model` that reads only text, it describes each uploaded image once, and the description reaches `model` in place of the image; a `model` that sees images is named as `visionModel` too, and then sees them itself. Without `visionModel`, an image reaches a local `model` as its name and type only. It must be a `local:` model, and the deploy pulls it with the others.

```yaml
model: local:qwen3.6:35b
visionModel: local:qwen3.6:35b
modelRuntime:
  url: http://localhost:11434
```

### `imageModel`

The model that generates images, as `provider:model`: `openai:` and `google:` models use the provider's key, and a `local:` model runs on the model runtime's OpenAI-compatible images API, which needs `modelRuntime.url`. Without `imageModel`, images are generated with OpenAI's default image model. The deploy does not pull a `local:` image model: the runtime's image backend loads its own model.

```yaml
imageModel: local:z-image-turbo
modelRuntime:
  url: http://localhost:11434
```

### `embedding`

Provider-backed semantic indexing is enabled by default. Disable it explicitly for offline or hermetic instances; lexical full-text search remains available.

```yaml
embedding:
  enabled: false
```

Semantic-only operations fail clearly while indexing is disabled.

### `mode`

`mode: eval` disables definition-owned side-effect members for evaluation runs.

### `logLevel`, `logFile`

Configure logging. Levels are `debug`, `info`, `warn`, and `error`. `logFile`
receives one JSON object per line; when the brain runs supervised, each line
carries the `role` (`web` or `worker`) of the process that wrote it.

## Site and theme

```yaml
site:
  package: "@brains/site-default"
  variant: professional
  theme: "@rizom/theme-default"
  themeOverride: ":root { --brand: rebeccapurple; }"
```

All fields are optional. Local `src/site.tsx` is always the effective site package when present; an explicit `site.package` becomes its base and the local file layers structural overrides over it. Local `src/theme.css` and `src/site-content.ts` apply when `site.themeOverride` or `plugins.site-content.definitions` is absent, respectively.

## Plugins

Built-in member config is keyed by canonical member ID:

```yaml
plugins:
  directory-sync:
    seedContentPath: ./seed-content
    initialSync: true
```

`brain.yaml` cannot load an external plugin package. A plugin entry with a `package` field uses the removed alpha contract and fails validation. An external plugin is a declarative package that a brain-definition package composes with `use()` in `defineBrain()`:

```ts
import calendar from "@acme/brain-plugin-calendar";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredCalendar = use(calendar, { timezone: "UTC" });

export default defineBrain({
  name: "acme-brain",
  plugins: [configuredCalendar],
  bundles: [defineBundle({ id: "core", members: [configuredCalendar] })],
});
```

The instance then names that definition package as `brain`:

```yaml
brain: "@acme/brain"
```

See [External Package Authoring](/docs/external-plugin-authoring). Keep secrets in environment interpolation, not in package defaults. External packages do not create policy bundles in the canonical definition.

## Principals and permissions

Top-level principal seeds:

```yaml
admins:
  - "discord:123"
anchors:
  - "discord:123"
trusted:
  - "discord:456"
spaces:
  - "discord:guild:channel"
```

Structured permissions:

```yaml
permissions:
  admins:
    - "discord:123"
  trusted:
    - "discord:456"
  rules:
    - pattern: "mcp:http"
      level: public
  entityActions:
    note:
      create: trusted
      update: trusted
      delete: admin
      extract: admin
      publish: admin
```

Principal seeds are unioned. Effective policy follows plugin, definition, bundle, then instance precedence, subject to validation that publishing cannot be looser than updating.

## Environment interpolation

`${NAME}` references are resolved from the environment. Unset values are removed rather than converted to the string `"undefined"`.

```yaml
plugins:
  directory-sync:
    git:
      authToken: ${GIT_SYNC_TOKEN}
```

The generated `.env.schema` declares every variable in the table below except `MCP_AUTH_TOKEN`.

## Integrations

Every integration is optional and stays off until its credentials are set. Some variables are read by the brain directly; the rest take effect only where `brain.yaml` references them.

| Variables                                                                                                                              | Switches on                                                                                                | Wiring                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`                                                                  | Models of that provider                                                                                    | Read directly; needed for each provider the configured models use                                         |
| `GIT_SYNC_TOKEN`                                                                                                                       | Git remote for `directory-sync`                                                                            | `plugins.directory-sync.git.authToken`                                                                    |
| `SETUP_EMAIL_TO`, `SETUP_EMAIL_API_KEY`, `SETUP_EMAIL_FROM`                                                                            | Setup links, invitations, and email notifications through Resend                                           | Wired by the `personal`, `professional`, and `team` recipes into `auth-service`, `notifications`, `email` |
| `IMAP_USER`, `IMAP_PASSWORD`                                                                                                           | An inbound mailbox, which the `email-workflows` add-on triages                                             | `plugins.email.imap` (`host`, `port`, `user`, `password`)                                                 |
| `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`                                                                    | The Discord chat adapter                                                                                   | Read directly when all three are set                                                                      |
| `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`                                                                                                   | The Slack chat adapter                                                                                     | `plugins.chat.adapters.slack`                                                                             |
| `MATRIX_BASE_URL`, `MATRIX_USER_ID`, `MATRIX_PASSWORD`                                                                                 | The Matrix chat adapter                                                                                    | Read directly; without a password the bot asks the brain's own homeserver                                 |
| `MATRIX_HOMESERVER_URL`, `MATRIX_SERVER_NAME`, `MATRIX_DATA_DIR`, `MATRIX_PUBLIC_URL`                                                  | The brain's own homeserver (`matrix` bundle)                                                               | Read directly; the generated deploy sets them                                                             |
| `ATPROTO_APP_PASSWORD`                                                                                                                 | AT Protocol publishing and discovery (`federation`)                                                        | Read directly                                                                                             |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID`                                                                                    | Publishing social posts to LinkedIn, as a person or an organization                                        | `plugins.social-media.linkedin.accessToken` and `.organizationId`                                         |
| `LINKEDIN_IMPORT_CLIENT_ID`, `LINKEDIN_IMPORT_CLIENT_SECRET`, or `LINKEDIN_IMPORT_BROKER_SECRET`                                       | The `linkedin-import` add-on, with its own LinkedIn app or through the broker                              | `plugins.linkedin-import.oauth` or `plugins.linkedin-import.broker`                                       |
| `ACCOUNT_SETTINGS_ENCRYPTION_KEY`                                                                                                      | Encrypted per-account plugin settings; required when a plugin declares them                                | Read directly                                                                                             |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ANALYTICS_SITE_TAG`, `CLOUDFLARE_ANALYTICS_BEACON_TOKEN`                  | Site traffic snapshots and reports (`analytics`); the beacon token only without Cloudflare automatic setup | `plugins.analytics.cloudflare` (`accountId`, `apiToken`, `siteTag`, `beaconToken`)                        |
| `UNSPLASH_ACCESS_KEY`                                                                                                                  | Stock-photo search (`stock-photo`)                                                                         | `plugins.stock-photo.apiKey`                                                                              |
| `BUTTONDOWN_API_KEY`                                                                                                                   | Newsletter delivery through Buttondown                                                                     | `plugins.newsletter.provider` with `type: buttondown`, `apiKey`                                           |
| `RESEND_API_KEY`, `RESEND_NEWSLETTER_SEGMENT_ID`, `RESEND_NEWSLETTER_FROM`, `RESEND_NEWSLETTER_REPLY_TO`, `RESEND_NEWSLETTER_TOPIC_ID` | Newsletter delivery through Resend                                                                         | `plugins.newsletter.provider` with `type: resend`, `apiKey`, `segmentId`, `from`, `replyTo`, `topicId`    |
| `MCP_AUTH_TOKEN`                                                                                                                       | A static MCP HTTP token for local development; a production brain refuses it                               | Read directly                                                                                             |

For example, LinkedIn publishing:

```yaml
plugins:
  social-media:
    linkedin:
      accessToken: ${LINKEDIN_ACCESS_TOKEN}
```

A deployed container receives only the variables listed under `env.secret` in `config/deploy.yml`. The generated list covers the provider keys, `GIT_SYNC_TOKEN`, the Discord variables, `ATPROTO_APP_PASSWORD`, and `SETUP_EMAIL_*`; add any other integration's variables there and push them with `brain secrets:push` (see the [Deployment Guide](/docs/deployment-guide#configdeployyml)).

## Recipes

Recipes are scaffold-time conveniences only. `brain init --recipe` expands them into explicit YAML; recipe names have no runtime meaning.

| Recipe         | Expansion                                                                              |
| -------------- | -------------------------------------------------------------------------------------- |
| `headless`     | `core`                                                                                 |
| `personal`     | `core + media + web + chat`                                                            |
| `professional` | `core + media + automation + web + chat + site + publishing + federation`              |
| `team`         | `core + media + automation + web + chat + site + team`, plus `docs` and `action-board` |

Identity, seed content, site, theme, permissions, and secret references remain visible instance-owned choices.

## Legacy migration

Preview an old built-in model/preset config without writing it:

```bash
brain config migrate
```

An unversioned canonical file already containing explicit overlapping bundle IDs is ambiguous and requires an explicit reviewed target:

```bash
brain config migrate --recipe professional
```

Review the output, then apply it deliberately with the matching runtime version. The command never writes `brain.yaml`, and the active runtime does not parse either the retired preset contract or unmarked canonical bundle selections.
