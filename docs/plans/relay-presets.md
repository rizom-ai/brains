# Plan: Relay Presets — Current & Future

Last updated: 2026-05-11

## Status

Active. Relay reference plan, refreshed to match `brains/relay/src/index.ts`: `core` currently has 15 configured capabilities, `conversation-memory` is the plugin id, and the agent-directory composite is registered as `agents`.

## Context

Relay is the **collaborative team knowledge brain**. Its distinguishing
trait vs. rover (personal/professional) and ranger (organization/community)
is that it's optimized for **multiple humans co-authoring understanding
together**: capture → synthesize → share, with teammates first and a
public face second.

This doc captures the preset philosophy, what's shipping today, and what
we deferred for later — so the next person touching relay doesn't have to
re-derive the design from scratch.

## Preset philosophy

Relay follows rover's preset progression: `core → default → full`, where
each tier is a strict superset of the one below it.

- **`core`** — a team brain with **no public website**. Think: a
  Discord-backed team assistant that captures notes and links, extracts
  topic clusters, and can talk to peer brains via A2A. Purely chat + MCP
  - brain-data.
- **`default`** — `core` plus the minimal website-building surface. The
  sweet spot for instances like `rizom-foundation` where you want to
  publish a small public site (e.g. a manifesto) from the brain's data.
- **`full`** — `default` plus existing team-knowledge surfaces. The sweet
  spot for Relay instances that want documentation and presentations
  without turning Relay into Rover's publishing stack.

## Shipping now

### `core` (15 capabilities)

```
prompt              ─ AI templates
directory-sync      ─ brain-data (+ seed content)
note                ─ free-form text capture
link                ─ URL bookmarks (huge for team reference-sharing)
topics              ─ auto-extract topic clusters (synthesis layer)
conversation-memory ─ durable summaries, decisions, and action items
agents              ─ agent + skill directory for peer brains
assessment          ─ derived SWOT/capability assessment from agents + skills
auth-service        ─ OAuth/passkey identity for operators and editors
cms                 ─ browser authoring surface
dashboard           ─ operator dashboard widgets
mcp                 ─ MCP interface (tool access)
webserver           ─ shared HTTP/admin surface
discord             ─ team chat interface (skipped if no bot token)
a2a                 ─ agent-to-agent transport (brain↔brain collab)
```

### `default` = `core` + 4

```
image              ─ image handling (public sites want images)
site-info          ─ site identity (title, CTA, theme mode)
site-content       ─ per-route content blocks
site-builder       ─ builds the public site
```

### `full` = `default` + 2

```
docs               ─ documentation entities/routes
decks              ─ presentations for team storytelling and talks
```

Instances can still use `add:` to opt individual full-tier plugins into a
smaller preset.

## Yes/no decisions made this round

1. **Does relay need a no-website tier?** Yes → `core` exists.
2. **Should `default` have zero content-entity nav (match
   rizom-foundation's temporary state)?** No, that's temporary.
   Content entities live in `core`/`default` and will register nav
   entries by default.
3. **Chat interface in `core`?** Yes — a team brain without chat is
   less useful than a team brain without a website.
4. **`note` + `link` + `image` in `core`?** `note` + `link` yes (they're
   the team's capture surface). `image` no in core, yes in `default`
   (public sites want images).
5. **`topics` + `conversation-memory` in `core` for synthesis?** Yes. `topics`
   creates the cross-entity map; `conversation-memory` turns team conversations into
   durable source material for later search/topic extraction.
6. **`a2a` + `agents` in `core`?** Yes. The whole
   "brains that talk to peer brains" story is fundamentally team-oriented.
7. **Define `full` now?** Yes, but keep it Relay-native. `full` adds
   existing team-knowledge surfaces (`docs`, `decks`) while deferring
   publishing-heavy Rover-like plugins until Relay-specific demand is clear.

## Deferred — design later

### Plugins that exist today but we're still holding

| plugin                    | probable tier | reason for defer                                                                  |
| ------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `obsidian-vault`          | `full`        | Power-user import/sync. Optional ergonomic layer.                                 |
| `notion`                  | `full`        | Useful team source integration, but read-only bridge UX should be scoped first.   |
| `hackmd`                  | `full`        | Useful collaborative-doc import bridge, but not required for the first POC loop.  |
| `blog` + `series`         | maybe never   | Rover owns long-form personal/professional publishing; Relay needs a clearer fit. |
| `analytics`               | maybe full    | Only if Relay public knowledge hubs need operator traffic insight.                |
| `content-pipeline`        | maybe full    | Likely useful after `team-digest` has a Relay-native product shape.               |
| `stock-photo`             | maybe full    | Pairs with publishing-heavy flows; defer unless docs/decks need it.               |
| `newsletter`/`buttondown` | maybe full    | Defer until team digest is designed as a Relay-specific capability.               |

### Plugins **not** in relay's scope

These belong elsewhere and should not be added to relay's capability
list:

| plugin                  | belongs to     | why not relay                                                          |
| ----------------------- | -------------- | ---------------------------------------------------------------------- |
| `portfolio`             | rover          | personal case studies                                                  |
| `social-media`          | rover / ranger | brand/social posting; Relay's output should be collaborative knowledge |
| `products` + `wishlist` | ranger         | product catalog / feature requests                                     |

## Future — plugins on the roadmap

Mapping [docs/roadmap.md](../roadmap.md) items that would naturally slot
into relay once they land:

| future plugin / feature                                       | target tier                  | notes                                                                |
| ------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| **multi-user + permissions** ([plan](./multi-user.md))        | `core`                       | defining feature for a team brain — users, roles, audit trail        |
| **Chat SDK migration** ([plan](./chat-interface-sdk.md))      | replaces `discord` in `core` | unified chat across Slack/Discord/Teams                              |
| **AT Protocol phases 1-2** ([plan](./atproto-integration.md)) | `default`                    | outbound publishing — teams push knowledge to decentralized feed     |
| **AT Protocol phases 3-6**                                    | `full`                       | inbound ingestion, cross-brain feeds, ambient federation             |
| **agents phase 2** (ATProto firehose)                         | `core`                       | auto-discover peer brains — `agents` is already registered in `core` |
| **monitoring — phase 3** (usage tracking)                     | `default` or `full`          | team operators need to see AI spend + usage                          |

## Future — hypothetical plugins worth naming

Plugins that don't have plans yet but would clearly belong to a team
brain. Ordered roughly by "how distinctively team-shaped is this".

| hypothetical      | target tier | why it fits relay                                                                                         |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `meeting-notes`   | `default`   | Capture + structure meeting transcripts. The single most concrete "team" artifact after basic notes.      |
| `decision-record` | `default`   | ADRs, decision logs with rationale. Core team artifact.                                                   |
| `rag-qa`          | `core`      | Conversational Q&A over the brain ("ask the team"). Arguably the most valuable thing a team brain can do. |
| `team-digest`     | `full`      | Scheduled "what the team did this week" rollup. Needs a Relay-native product shape before implementation. |
| `knowledge-graph` | `full`      | Visualize entity connections. Discovery aid for large knowledge bases.                                    |
| `shared-drafts`   | `full`      | Live collaborative editing on entities. Hard but very team-shaped.                                        |
| `task-tracker`    | `full`      | Lightweight team tasks — only if it stays entity-shaped, not a full project-management app.               |

**Prioritization if we wanted relay to actually differentiate itself
as a team brain (vs. "rover minus the personal stuff"):**

1. `meeting-notes`
2. `decision-record`
3. `rag-qa`
4. `team-digest`

Those four would give relay a distinctive team identity. `team-digest`
should be scoped as a Relay-specific product surface before reusing the
existing publishing/newsletter stack.

## Open questions to revisit when expanding `full`

- **Content-entity nav bloat.** `docs` and `decks` add public routes; future
  plugins such as decision records, meeting notes, or team digests should
  have explicit nav/route policy instead of inheriting Rover's publishing
  assumptions.
- **Analytics provider.** `analytics` currently ties to Cloudflare Web
  Analytics. Add it only if Relay public knowledge hubs need traffic insight,
  and consider whether internal team brains need a different usage signal.
- **`site-content` vs. route override.** With `site-content` in `default`,
  instances can customize homepage sections via brain-data. We may not
  need brain.yaml route overrides at all for most cases. Revisit the
  rizom-foundation "how do I get a single-page manifesto site" flow once
  `site-content` is wired through the home route template.

## Consumer app impact — snapshot

| consumer instance        | brain | preset    | `add:` | result                                |
| ------------------------ | ----- | --------- | ------ | ------------------------------------- |
| `rizom.foundation` repo  | relay | `default` | —      | minimal public site for the manifesto |
| `example relay instance` | relay | `full`    | —      | team knowledge hub with docs + decks  |

## POC readiness

### Changes made

- Added `conversation-memory` to Relay `core`.
- Configured Relay `topics` with durable source entity types and excluded topic-derived sources (`skill`) to break projection cycles.
- Added `extractableStatuses` to `@brains/topics` so Relay can include `draft` links without changing global topic defaults.
- Added Relay `full` with docs and decks only, keeping publishing-heavy plugins deferred.
- Registered the agent-directory composite as `agents` and updated Relay preset docs to match the current model.

### Acceptance checklist

- A Discord user can save a note and capture a URL.
- Captured notes, draft links, summaries, agents, and skills can feed topic extraction.
- A team conversation produces durable conversation-memory entities, starting with `summary`.
- `system_search` can find notes, links, summaries, and topics.
- An operator can view dashboard/CMS on the webserver without enabling the public site stack.
- A saved and approved peer `agent` can be called through A2A.
- `preset: default` can still build a minimal public site when needed.
- `preset: full` enables docs and decks without pulling in Rover-style publishing.
