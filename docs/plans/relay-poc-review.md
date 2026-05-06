# Relay POC Review

Last updated: 2026-05-06

## Goal

Get a credible Relay POC out with the smallest plugin surface that proves the product loop:

```text
capture team knowledge → synthesize it → make it searchable/shareable → coordinate with peer brains
```

## Recommended POC scope

### Core POC: private team brain

Use `preset: core` as the first POC target.

Required capabilities:

| Need                             | Existing plugin/interface             | POC decision                                        |
| -------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Durable markdown source of truth | `directory-sync`                      | Keep in `core`                                      |
| Team notes                       | `note`                                | Keep in `core`                                      |
| Team link sharing                | `link` + Discord URL capture          | Keep in `core`                                      |
| Conversation memory              | `summary`                             | Move into `core`                                    |
| Topic map / synthesis            | `topics`                              | Keep in `core`, but configure real source types     |
| Peer brain directory             | `agent-discovery` (`agent` + `skill`) | Keep in `core`                                      |
| Peer brain calls                 | `a2a`                                 | Keep in `core`                                      |
| Tool access                      | `mcp`                                 | Keep in `core`                                      |
| Team chat access                 | `discord`                             | Keep in `core`                                      |
| Operator/admin surface           | `webserver`, `dashboard`, `cms`       | Keep in `core`                                      |
| Prompt editing                   | `prompt`                              | Keep in `core`                                      |
| Agent/skill assessment           | `assessment`                          | Keep in `core` for now; reassess after POC feedback |

### Default POC: minimal public site

Use `preset: default` when the POC needs a public face.

Additions over `core`:

| Need                   | Existing plugin | POC decision      |
| ---------------------- | --------------- | ----------------- |
| Site identity          | `site-info`     | Keep in `default` |
| Route/section copy     | `site-content`  | Keep in `default` |
| Static site generation | `site-builder`  | Keep in `default` |
| Site image handling    | `image`         | Keep in `default` |

### Full POC: public team knowledge hub

Use `preset: full` when the POC needs existing structured team-knowledge surfaces, without copying Rover's publishing stack.

Additions over `default`:

| Need          | Existing plugin | POC decision  |
| ------------- | --------------- | ------------- |
| Documentation | `docs`          | Put in `full` |
| Presentations | `decks`         | Put in `full` |

## Findings

1. **No new plugin is required for the first POC.** Existing `note`, `link`, `summary`, `topics`, `agent-discovery`, `assessment`, `dashboard`, `cms`, and interfaces cover the minimum product loop.
2. **`topics` was present but effectively inert in Relay.** Its default `includeEntityTypes` is `[]`, and Relay passed `{}`. The POC needs explicit source types.
3. **Relay links are saved as `draft` after extraction.** Default topic extraction only processes `published` or statusless entities, so captured links would not inform the team topic map unless configured.
4. **`summary` is now ready enough for core POC use.** The follow-up checklist is complete, and conversation summaries are central to Relay's team-memory story.
5. **Docs/decks belong in `full`; publishing-heavy plugins stay deferred.** Existing docs/decks support public team knowledge hubs, while blog/series/newsletter/content-pipeline need a clearer Relay-native product shape.

## Changes made for POC readiness

- Added `summary` to Relay `core`.
- Configured Relay `topics` with source entity types: `base`, `link`, `summary`, `agent`, `skill`, `swot`, `deck`, `doc`, `anchor-profile`, and `brain-character`.
- Added `extractableStatuses` to `@brains/topics` so Relay can include `draft` links without changing global topic defaults.
- Added Relay `full` with docs and decks only, keeping publishing-heavy plugins deferred.
- Updated Relay docs/preset plan to match the current model.

## Plugins not needed in `core` / `default`

| Plugin                               | Preset decision                                                |
| ------------------------------------ | -------------------------------------------------------------- |
| `decks`                              | `full`                                                         |
| `docs`                               | `full`                                                         |
| `blog` / `series`                    | Defer; too close to Rover publishing without a clearer fit     |
| `analytics`                          | Defer; only add if Relay knowledge hubs need traffic insight   |
| `content-pipeline`                   | Defer until `team-digest` has a Relay-native product shape     |
| `stock-photo`                        | Defer; pairs with publishing-heavy flows                       |
| `newsletter`                         | Defer until team digest is designed as a Relay-specific plugin |
| `obsidian-vault`, `notion`, `hackmd` | Defer; source/import integrations need separate UX decisions   |
| `social-media`                       | Outside Relay core; brand/social publishing fits Rover/Ranger  |
| `products`, `wishlist`, `portfolio`  | Belong to other brain models                                   |

## New plugin candidates

Do not create these before the first POC. Scope them after watching real usage.

1. **`meeting-notes`** — structured meeting transcript/notes entity. Likely first new Relay-specific plugin.
2. **`decision-record`** — durable team decisions with rationale, owner, date, and linked context.
3. **`team-digest`** — scheduled weekly summary from notes, links, topics, and conversations.
4. **`knowledge-graph`** — visualization/query layer over entity relationships.

## POC acceptance checklist

- A Discord user can save a note and capture a URL.
- Captured notes, draft links, summaries, agents, and skills can feed topic extraction.
- A team conversation produces a durable `summary` entity.
- `system_search` can find notes, links, summaries, and topics.
- An operator can view dashboard/CMS on the webserver without enabling the public site stack.
- A saved and approved peer `agent` can be called through A2A.
- `preset: default` can still build a minimal public site when needed.
- `preset: full` enables docs and decks without pulling in Rover-style publishing.
