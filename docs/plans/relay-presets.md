# Plan: Relay Presets — Current & Future

Last updated: 2026-04-06

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
- **`full`** — _(deferred)_ `default` plus the rich publishing stack. The
  sweet spot for presentation-heavy relay instances with essays,
  presentations, admin dashboards, and analytics.

## Shipping now

### `core` (10 plugins)

```
prompt             ─ AI templates
directory-sync     ─ brain-data (+ seed content)
note               ─ free-form text capture
link               ─ URL bookmarks (huge for team reference-sharing)
topics             ─ auto-extract topic clusters (synthesis layer)
agent-discovery    ─ directory of peer brains
skill              ─ capabilities published in the Agent Card
mcp                ─ MCP interface (tool access)
discord            ─ team chat interface (skipped if no bot token)
a2a                ─ agent-to-agent transport (brain↔brain collab)
```

### `default` = `core` + 5

```
image              ─ image handling (public sites want images)
site-info          ─ site identity (title, CTA, theme mode)
site-content       ─ per-route content blocks
site-builder       ─ builds the site
webserver          ─ serves it
```

### Also registered (opt-in via `add:`)

Plugins that are compiled into relay's capability list but not in any
preset. Instances opt in per their needs.

```
decks              ─ presentations (presentation-heavy instances use this)
summary            ─ content summarization (needs work — see below)
```

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
5. **`topics` + `summary` in `core` for synthesis?** `topics` yes —
   it's the feature that makes relay _relay_. `summary` deferred — needs
   rework before it joins a preset.
6. **`a2a` + `agent-discovery` + `skill` in `core`?** Yes. The whole
   "brains that talk to peer brains" story is fundamentally team-oriented.
7. **Define `full` now?** No, defer. Only ship `core` + `default`; let
   presentation-heavy relay instances opt into extras explicitly via `add:` for now.

## Deferred — design later

### Plugins that exist today but we're holding

| plugin             | probable tier       | reason for defer                                                                  |
| ------------------ | ------------------- | --------------------------------------------------------------------------------- |
| `summary`          | `core` or `default` | Needs work. Batched extraction, prompt rework. Re-evaluate after.                 |
| `decks`            | `default` or `full` | Team presentations are real but the UX is presentation-heavy. Opt-in for now.     |
| `blog` + `series`  | `full`              | Long-form team essays — useful, but adds nav + routes. Decide once `full` exists. |
| `dashboard`        | `full`              | Admin panel for operators. Only makes sense with a running site.                  |
| `analytics`        | `full`              | Only matters when the site is public and getting traffic.                         |
| `stock-photo`      | `full`              | Pairs with `decks`/`blog` — defer with them.                                      |
| `obsidian-vault`   | `full`              | Power-user import/sync. Optional ergonomic layer.                                 |
| `content-pipeline` | `full`              | Scheduled generation (e.g. weekly digest). Powerful but heavy.                    |

### Plugins **not** in relay's scope

These belong elsewhere and should not be added to relay's capability
list:

| plugin                      | belongs to     | why not relay                                                         |
| --------------------------- | -------------- | --------------------------------------------------------------------- |
| `portfolio`                 | rover          | personal case studies                                                 |
| `social-media`              | rover / ranger | brand social posts                                                    |
| `newsletter` + `buttondown` | rover          | personal newsletter publishing (could revisit as _team-digest_ later) |
| `products` + `wishlist`     | ranger         | product catalog / feature requests                                    |

## Future — plugins on the roadmap

Mapping [docs/roadmap.md](../roadmap.md) items that would naturally slot
into relay once they land:

| future plugin / feature                                       | target tier                  | notes                                                            |
| ------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| **multi-user + permissions** ([plan](./multi-user.md))        | `core`                       | defining feature for a team brain — users, roles, audit trail    |
| **Chat SDK migration** ([plan](./chat-interface-sdk.md))      | replaces `discord` in `core` | unified chat across Slack/Discord/Teams                          |
| **AT Protocol phases 1-2** ([plan](./atproto-integration.md)) | `default`                    | outbound publishing — teams push knowledge to decentralized feed |
| **AT Protocol phases 3-6**                                    | `full`                       | inbound ingestion, cross-brain feeds, ambient federation         |
| **agent-discovery phase 2** (ATProto firehose)                | `core`                       | auto-discover peer brains — already registered in `core` as stub |
| **monitoring — phase 3** (usage tracking)                     | `default` or `full`          | team operators need to see AI spend + usage                      |

## Future — hypothetical plugins worth naming

Plugins that don't have plans yet but would clearly belong to a team
brain. Ordered roughly by "how distinctively team-shaped is this".

| hypothetical      | target tier | why it fits relay                                                                                         |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `meeting-notes`   | `default`   | Capture + structure meeting transcripts. The single most concrete "team" artifact after basic notes.      |
| `decision-record` | `default`   | ADRs, decision logs with rationale. Core team artifact.                                                   |
| `rag-qa`          | `core`      | Conversational Q&A over the brain ("ask the team"). Arguably the most valuable thing a team brain can do. |
| `team-digest`     | `full`      | Scheduled "what the team did this week" rollup. Reuses content-pipeline + newsletter machinery.           |
| `knowledge-graph` | `full`      | Visualize entity connections. Discovery aid for large knowledge bases.                                    |
| `shared-drafts`   | `full`      | Live collaborative editing on entities. Hard but very team-shaped.                                        |
| `task-tracker`    | `full`      | Lightweight team tasks — only if it stays entity-shaped, not a full project-management app.               |

**Prioritization if we wanted relay to actually differentiate itself
as a team brain (vs. "rover minus the personal stuff"):**

1. `meeting-notes`
2. `decision-record`
3. `rag-qa`
4. `team-digest`

Those four would give relay a distinctive team identity. They're worth
scoping as separate plans before we lock in a `full` preset.

## Open questions to revisit when defining `full`

- **Content-entity nav bloat.** `decks`, `blog`, `series` all auto-register
  routes. A `full` preset with all of them gives you `/decks`, `/posts`,
  `/series` in the navbar automatically. Is that desired, or do we want
  per-instance nav curation?
- **Dashboard credentials.** `dashboard` wants auth. Does `full` assume
  the instance has set up anchors, or does dashboard gracefully skip
  when no anchors are configured?
- **Analytics provider.** `analytics` currently ties to Cloudflare Web
  Analytics. Team brains deployed internally (not public) may want
  different providers or none.
- **`site-content` vs. route override.** With `site-content` in `default`,
  instances can customize homepage sections via brain-data. We may not
  need brain.yaml route overrides at all for most cases. Revisit the
  rizom-foundation "how do I get a single-page manifesto site" flow once
  `site-content` is wired through the home route template.

## Consumer app impact — snapshot

| consumer instance        | brain | preset    | `add:`    | result                                                                       |
| ------------------------ | ----- | --------- | --------- | ---------------------------------------------------------------------------- |
| `rizom.foundation` repo  | relay | `default` | —         | minimal public site for the manifesto                                        |
| `example relay instance` | relay | `default` | `[decks]` | minimal site + decks (lost `summary` until rework, lost old implicit extras) |

## Known latent bugs surfaced this round

- **`parseInstanceOverrides` silently drops all overrides on Zod failure.**
  An empty YAML field like `anchors:` parses as `null`, which doesn't
  satisfy `z.array(z.string()).optional()` (optional means `undefined`,
  not `null`). The entire overrides object is discarded silently instead
  of surfacing an error. A relay instance had this bug and was running with
  _zero_ overrides until this round's cleanup removed the empty
  `anchors:` field. Fix later: either coerce `null → undefined` in the
  pre-validation step, or surface parse errors instead of falling back
  to `{}`.
