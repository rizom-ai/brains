# Plan: Public Ask — guest chat on a Brain's public pages

Last updated: 2026-09-21

## Status

**Production guest activation and production-page publication remain unapproved on every deployment. The Rizom preview allowance of two messages and four dollars has been spent; it must not be reopened, and further paid messages need fresh explicit approval rather than ledger renewal.**

Guest admission is per deployment. No deployment's authorization, allowance, spend or evidence carries to another. This plan owns the capability and every site's rollout.

Shipped baseline, verified with synthetic providers:

- a server-owned guest identity and isolated conversation scope;
- default-off guest admission and a localhost-only test preset;
- atomic issuance, request, concurrency, turn, retention, and spend accounting;
- public-only context with an explicit read/search allowlist;
- owned send, follow-up, history, retry/status, expiry, and deletion paths;
- safe Markdown plus bounded public source cards;
- the standalone `/ask` presentation, the Brain-page hero box, and an optional Dashboard tab, all on the same guest runtime;
- the shared `ask-content` singleton entity as the authored welcome and topics for all three;
- fail-closed handling for ambiguous first sends, lost credentials, unsupported browsers, and uncertain remote completion; and
- packaged/browser/canary checks against the published core/site pair.

Open from the Dashboard Ask rollout, carried forward verbatim:

- the operator configuration path for per-user `plugins.dashboard.ask` is not yet merged or released;
- content PR [rizom-content#2](https://github.com/rizom-ai/rizom-content/pull/2) prepares the public `ask-content/ask-content.md` and removes the obsolete `hero.chat` section, and remains draft; and
- enabling the Ask tab on Rizom is an owner choice that has not been applied.

## Next milestone

Slice A, the usage record, then Slice B, the Studio monitor. No deployment opens production guest access before its owner can see what the endpoint did and switch it off. No release, deployment or enablement is authorized by plan approval alone.

This milestone does **not** enable production guests or publish a new production page on any deployment.

### Remaining acceptance work

1. **Validate with synthetic providers.** Use an isolated canonical running app with an app-managed preview rebuild, theme and mobile checks, and owned conversation recovery and deletion. Never spend a hosted allowance in automated checks.
2. **Keep evidence boundaries explicit.** Owner-reported activation and an owner-reported live flow are not independent billing evidence. Obtain existing evidence only through ordinary authenticated access. Additional paid messages require fresh explicit approval, not ledger renewal.
3. **Retain honest failure handling.** Check partial and disconnected delivery, known-locator retry and status, expiry, denial and deletion races, without replaying ambiguous work or promising remote cancellation.
4. **Release and enable separately, per deployment.** Review implementation evidence before release or deployment. Production policy, publication and guest enablement remain separate decisions for each site.

## Launch gates

Before unattended public access on any deployment:

- approve exact provider, spend, request, concurrency, issuance, retention, timeout, cleanup, and disclosure policy;
- validate the HTTPS/origin/proxy posture and network-level abuse controls;
- verify shared transactional accounting for every production replica;
- verify cleanup throughput and admission behavior during unhealthy storage or maintenance;
- document recovery for uncertain execution and credential work without refunding or releasing reservations based only on elapsed time;
- approve finite usage-record retention and storage limits, and verify denial-flood and storage-failure behavior;
- record and display guest requests, denials, known settled cost and outstanding or unknown reservations to the owner, with a reachable kill switch, before admitting any production visitor;
- verify the kill switch, already-running work behavior, authenticated Chat regressions, operational visibility, backup, and rollback;
- publish production output only after explicit preview approval; and
- obtain separate explicit authorization to enable guest admission.

Passing tests, deploying packages, pushing content, or building preview does not satisfy these gates.

## Product scope

Public Ask is a visitor's encounter with a Brain's own public knowledge, on that Brain's pages:

- no account is required after production guest admission is explicitly enabled;
- answers and synthesis use public Brain knowledge and may include validated public sources;
- visitors may supply question text but cannot edit Brain content, publish, administer, schedule work, approve actions, upload files, call arbitrary URLs, or access operator tools;
- visitor conversations remain isolated and do not automatically become Brain knowledge;
- visitor questions are recorded for the owner in the Slice A usage record, which the disclosure states plainly; and
- the standalone page, the Brain-page hero box and the Dashboard tab continue the same owned conversation under identical policy.

It is not a scripted sales bot, a support-only interface, public Studio access, or a second chat engine. Ask's visibility setting does not enable guest execution, renew credentials, reset limits or change public-only permissions.

## Non-negotiable boundaries

### Identity and authorization

- Guest credentials are opaque, server-owned, and held only in secure HTTP cookies in production; URLs and browser storage carry only bounded locators.
- Conversation IDs are locators, never authorization. Forged, foreign, expired, or deleted conversations reveal no content.
- Signed-in owner authority does not upgrade the guest surface, and a signed-in viewer must never silently elevate guest chat to owner Chat.
- Public visibility filtering happens before context, excerpts, metadata, attachments, or tool results reach the model.
- Installing another plugin never grants its tools to guests automatically.
- Browser input cannot supply roles, system instructions, operator context, approvals, tool permissions, or owner identity.

### Authored content

- The `ask-content` singleton is the only authored source of the welcome and suggested topics, across the standalone page, the Dashboard tab and the Brain-page chat. It is independent of any site page schema, and no hero-copy fallback is retained.
- Missing or invalid optional content means no welcome and no suggestions. No invented fallback prose, promotional defaults, implicit generation, or page-specific copy shims.
- Only public entity content may reach a public visitor.
- Privacy, availability, expiry and limits come from runtime policy, never from this entity.
- Code ships before content. An older site still requires the section a content migration removes, so a rollback to that site version must restore the old content section too.

### Accounting and lifecycle

- Capacity is reserved transactionally before generation. Cookie resets, tabs, retries, restarts, and replicas must not evade limits.
- Disconnection, timeout, expiry, or local abort is not proof that provider work stopped. Preserve uncertain reservations and report that truthfully.
- Retries require a known conversation locator and submission identity. Losing both credential and locator is deliberately unrecoverable; the UI must not replay the request.
- Retention cannot be extended by resume or policy loosening. Deletion/expiry prevents late writes from resurrecting a conversation.
- Credentials, replies, and raw conversation identifiers stay out of routine logs and analytics. Visitor question text is recorded only in the owner-facing usage record defined in Slice A, never in routine logs, and the visitor disclosure must say so.

### Presentation

- Render safe Markdown and reviewed source cards only; reject executable HTML, unsafe links, unsupported actions, and fabricated citations.
- Keep submitted text and received partial output visible on failure. Retry is deliberate and deduplicated.
- Distinguish waiting, stopped waiting, disconnected, complete, unavailable, expired, deleted, and limit-reached states.
- Topic suggestions fill the composer but never submit automatically.
- No generation occurs on page load, availability checks, focus, tab selection, navigation, or recovery.
- Missing content and unavailable access render honestly.

## Supported test posture

The existing localhost test convention remains:

```yaml
plugins:
  web-chat:
    guest: local-test
```

- canonical `packages/brain-cli` `start:personal` posture;
- trusted loopback socket metadata and loopback binding;
- one fixed OpenAI guest profile using the official endpoint, standard tier, `store: false`, no cache writes, no native provider tools, no provider streaming bypass, and no automatic retries;
- text input only, 4,000 characters per message, 1,200 cumulative output tokens, and at most three model/tool steps;
- prepaid single-use query embeddings with background indexing accounted separately; and
- a small inspected public-source corpus.

These are test conventions, not approved production defaults.

## Shipped authorization surface

Live constraints of the deployed guest-authorization code, not a rollout log:

- Guest admission is default-off. An explicit `guest: false` also blocks runtime activation.
- Activation is an admin-only, same-origin `GET/POST` on the chat API. `POST` accepts only `{ enabled }`; there is no hostname, budget or reset override. `GET` grants nothing and calls no model, and activation is primary-host-only.
- Authorization and lifetime reservations share one compare-and-set ledger. Disabling and re-enabling, retries, cleanup and restarts never restore credit.
- Guest handlers and their presentation assets declare their own routing. The transport preserves admission checks and excludes undeclared handlers and tool APIs.
- Owned history and deletion stay available after an allowance is exhausted.

## Planned slices

Four slices, plus explicit site integration in each rollout. None is authorized by this plan alone; each needs its own review. Slices A and B gate Slice C: production guest access is not opened until the usage record and its Studio view exist, because an endpoint nobody can observe cannot be sized or defended. The standalone Slice D form and authored homepage can ship without A through C, after their own review; attaching a guest conversation is a later integration. No slice adds a second chat engine.

### Slice A: the usage record

Goal: a durable answer to what the public endpoint actually did, because today almost nothing survives.

Current state, verified against `origin/main`: two monotonic lifetime counters, a set of reservation receipts that self-prunes after roughly a day, and an admin-only endpoint returning the counters. Both the admission ledger and `GuestTurnBudget` charge worst-case quotes; neither supplies an actual-cost settlement contract. The ten admission denial reasons are recorded nowhere, and the guest modules contain no logger calls at all. The analytics plugin is a read-only Cloudflare proxy and cannot accept events.

- Persist an admission event before execution and append an idempotent outcome event when known, joined by an internal request key. Retries and concurrent settlement must not duplicate requests or cost. Record timestamps, outcome, reserved cost, known settled cost or an explicit unknown-cost state, a salted visitor digest when identity exists, and validated question text. Interrupted work remains visibly unresolved, not silently successful or zero-cost.
- Add a typed settlement contract based on returned provider usage and a pinned supported pricing revision, including applicable input, output, cache, reasoning and tool/embedding charges. A quote or the difference in `GuestTurnBudget`'s balance is never actual cost. Missing usage, unsupported pricing or uncertain remote completion stays unknown; retain its reservation. Recording measured cost does not refund or reset the existing authorization ledger. Do not describe locally calculated cost as independently reconciled provider billing.
- Question text is recorded deliberately, only after bounded validation and the recording disclosure has been presented. Denials before that point record no question text; missing visitor identity is represented as absent, never invented. Update the runtime disclosure before enabling recording, including the separate retention period and the fact that deleting a conversation does not delete its usage record.
- Recorded questions are admin-only monitor records, not entities, embeddings or projection inputs. Slice B carries an owner action to promote a single question deliberately. Credentials, replies and raw conversation locators are never recorded.
- Set finite record age, question-byte, row and total-storage limits before recording is enabled. Records may outlive conversations but expire on their own fixed schedule; retries do not renew them. Cleanup must not erase lifetime accounting or unresolved reservations, which remain separately bounded admission state.
- Within the detailed-record allowance, append denial events with their reason. Once that allowance is reached, retain bounded time-bucketed counts by reason without text or per-visitor cardinality, and show aggregation explicitly in Studio. Reject malformed or oversized input without retaining its raw body. Denied traffic must not bypass storage or write-rate limits.
- Reserve record and outcome capacity before admitting work. If durable recording is unhealthy or full, deny new generation while preserving owned history/deletion and the existing denial response contract. Surface recording outages through bounded, sanitized operational health; do not fall back to transcript logging. A failed settlement write leaves the request unresolved and its reservation intact.
- The auth audit event store is the precedent for append-only events and an admin view, not permission to retain unbounded question text.
- Tests first: admission survives a crash before completion; retries settle once; known usage prices correctly and missing usage remains unknown; denial floods stay bounded without changing denial responses; storage failure prevents generation; cleanup honors independent retention without restoring credit; conversation deletion leaves unexpired monitor records intact; no credential or reply text is written.

### Slice B: the Studio monitor

Goal: the owner can see what the endpoint is doing and stop it, in one place.

- An admin-only Studio workspace declared with `defineStudioWorkspace`, whose server-side loader reads the Slice A records directly. Studio workspaces are schema-driven and a plugin cannot ship its own React view, so the display is built from the existing block set.
- Shows requests and known settled cost for today and the current month, outstanding/unknown reservations separately, and the amount still charged against the admission ceiling. Never imply that low measured cost restores allowance. Denials are grouped by reason, with detailed versus aggregated coverage explicit; visitor rankings and recent questions describe only the retained detail window. Queries and result sizes are bounded.
- There is no chart or timeseries block. Trends use `stats`, `meters` and `table`.
- The existing enable and disable authorization becomes a workspace action, so the off switch sits next to the numbers rather than in configuration. Recording health and retention are visible beside it.
- A separate, confirmed admin action may promote one recorded question to an entity. Reading the monitor never promotes content automatically.
- Tests first: the workspace refuses a non-admin caller at both the registry floor and the runtime check; empty, aggregated and unknown-cost states render truthfully; promotion requires confirmation; the off action denies further admissions immediately.

### Slice C: production guest access

Goal: a composer on a public production page actually answers.

Current state, verified against `origin/main`: the guest policy derives its origin from the deployment's preview URL and disables itself when that origin equals the production site URL, and the only authored configuration shape is the local test preset. Preview is a verification step, not a destination.

- Add a production policy shape carrying origin, allowance and budget, authored in the brain configuration. Admission accepts it while staying default-off and still requiring explicit operator authorization.
- Size the limits from what Slice A shows, not from the current defaults, which are a two-request lifetime trial allowance.
- Per-visitor, per-network and global limits, a hard monthly ceiling, and a kill switch reachable from Slice B. On exhaustion the composer shows its unavailable state and the Slice D door keeps working.
- Done: the site-owned chat boot moved into Web Chat as the shared box boot (`/ask/assets/box.js`, served only while guest assets are enabled), with its host DOM contract in `@brains/contracts` (`ask-box`). The Rizom hero and the professional atlas consume it on the existing guest runtime and authored-content contract. Hosts that set `data-ask-styled` get Web Chat's shared box presentation, which the dashboard's Ask panel also uses; the Rizom hero keeps its own frame.
- Every launch gate above applies. Enablement stays a separate explicit decision per deployment, and preview is where each change is verified before the production deploy.
- Tests first: every consuming site passes the shared mount/DOM contract; a production-origin request is denied until explicitly authorized; exhaustion degrades to the unavailable state without losing the visitor's draft or the independent contact link.

### Slice D: a door to the owner

Goal: a visitor can reach the owner without an account and without the chat runtime.

**Implementation progress, not deployment approval:** `plugins/contact` now composes the restricted entity and service, with explicit default-off policy, readiness-gated no-JavaScript routes, atomic admission/storage caps, and conditional persistence. A durable notification job uses bounded CAS attempts/leases and a fixed first-attempt retry window; known acknowledgements are repaired into entity status without resending, including late acknowledgements after a failed projection. Notifications contain only a generic alert and a same-origin Studio Inbox link. The notifications plugin's internal subscription now works in execution-only workers. Startup and shell-owned daily maintenance recover pending enqueues and delete expired records plus their delivery ledger state; uncertain writes never regain capacity merely through elapsed time. Failed or overdue maintenance closes intake, and aggregate operational health reports pending/failed work without contact details. The canonical catalog exposes contact only for explicit addition, and the professional site has an opt-in authored opening that appears only beside a matching live form route. Tests use synthetic transport and temporary SQLite connections, covering restart, competing workers, duplicate/conflicting posts, bounded reads, lost acknowledgements, cleanup failure, and server-rendered homepage behavior. This work has not enabled intake on a deployment. Local running-app evidence is recorded below; deployment configuration, verified private sync/backup and proxy policy, approved retention/deletion lag, brand-font visual review, and owner acceptance remain outstanding.

**Local verification, 2026-09-22:**

- Recreated the isolated worktree from `845810658c`. Started the canonical publishing app with temporary explicit contact/site configuration, loopback HTTP, isolated databases and private local sync, no Git remote, disabled embeddings, and a preloaded external-HTTP guard. Rebuilt preview through authenticated remote MCP on the running app. The app is now stopped and the canonical fixture is restored; runtime databases were retained, not reset.
- Native Chrome form submission with JavaScript disabled exposed a real bug: `Referrer-Policy: no-referrer` caused `Origin: null`, so the strict handler rejected legitimate POSTs. Changed the policy to `same-origin`, preserving cross-site referrer suppression and strict origin rejection. Added a regression assertion. Also fixed the one-day disclosure ("1 day", not "1 days").
- Verified escaped validation drafts, keyboard focus, saved/303 confirmation with explicit theme preserved, identical retry/303, changed retry/409, foreign-origin/403, restricted persistence, synthetic durable notification acknowledgement, and restart without resending. Filled the explicit ten-record fixture cap and exercised capacity/503 and form-rate/429 states. All ten records remained restricted with sent notification status; submitted addresses were absent from generated preview, routine logs and checked anonymous routes, with no contact FTS entries or embeddings.
- Captured homepage, form, confirmation, validation, capacity and rate-limit pages at 390px and 1440px widths in both themes: 24 combinations, without horizontal overflow. The captures were a local review set and are not kept in the repository. Copy and posts are unapproved synthetic/local fixtures. External browser traffic was blocked, so screenshots use fallback fonts; final brand typography still needs review. No guest chat or real email was used. The HTTP guard blocked an initial starter-character generation attempt before network access; subsequent startup and contact checks made no model requests.
- Remaining verification limits: physical expiry cleanup is covered by automated tests, not a 24-hour running-app expiry test; authenticated Inbox interaction and deployed HTTPS/proxy behavior still need acceptance. A remote directory-sync attempt hit a projection-batch fencing error on the restored baseline; startup import succeeded instead. That unrelated failure remains a separate follow-up, not a passing sync check.

- A small compound plugin owns the `contact-request` entity and its service, registers an `InboxSource`, and declares narrowly scoped public form GET/POST handlers through `getWebRoutes`. No existing plugin's domain covers contact. The inbox is a pull-based source registry, not a "create inbox item" call.
- Do not use the current `getApiRoutes` tool bridge for intake: it parses the whole body before invoking a tool and forwards neither cookies nor trusted network metadata. Web handlers already receive the raw request and socket metadata. Keep intake out of the public tool catalog; the newsletter route is a form/redirect precedent, not an abuse-control precedent.
- Force admin-only entity visibility regardless of submitted fields. Set `embeddable: false`, `fullTextSearchable: false` and `projectionSource: false`; contact details are private operational records, never automatic Brain knowledge or provider input. Keep them out of public routes, feeds and exports, and preserve visibility in private sync/backups. Approve finite retention, request/storage caps and deletion behavior before enabling intake, and state these on the form.
- Bound body bytes and read time before parsing, then validate bounded fields with Zod and check the honeypot. Enforce atomic global and network-bucket limits in runtime state, using server-owned socket identity, never cookies, submitted IPs or untrusted forwarding headers. Missing trusted network identity fails closed. Verify the deployment's proxy posture; do not add a client-controlled identity fallback.
- Declare the accepted origins and enforce them at the handler, including cross-site form rejection. Preview reachability is an explicit handler opt-in, not exposure of other tool APIs. Verify preview intake on an isolated app with synthetic notification delivery, not by sending test requests to the live owner's inbox.
- A runtime form GET issues a short-lived opaque submission token under the same issuance limits; never bake one shared token into static site output. A plain POST works without JavaScript or guest credentials. Use the token, a canonical payload digest and deterministic entity identity for conditional creation: an identical retry returns the accepted result, changed payload reuse is rejected, and concurrent submissions or recovery after a crash cannot create another request. Store only bounded, expiring token state; never put contact fields in redirect URLs.
- Persist notification-pending state with the accepted request. A bounded durable delivery job uses a stable request-derived idempotency key, records delivery status and retries transient failure without recreating the entity. Reconcile a crash between persistence and enqueue. Missing configuration or exhausted retries remain visible to the owner; successful intake means saved, not necessarily notified. Notifications contain a generic alert and an authenticated inbox link, not the submitted address/message. Routine errors and logs must be sanitized too.
- Once Slice C is live, the Brain may offer the door as text, never invoke it. Optional conversation attachment must be verified server-side by the existing guest ownership rules using the request's credential, locator and expiry/deletion state; expose a narrow shared verifier rather than trusting a form field or copying authorization logic. Foreign, forged, expired, deleted or unverifiable locators are stored as absent without revealing why. The contact request still succeeds independently. Inbox links remain admin-authorized and tolerate later conversation deletion; no transcript is copied into the contact record.
- The owner replies outside the page, by ordinary email or a call. Contact delivery uses no model or embedding calls and consumes no guest allowance.
- Tests first: no-JavaScript GET/POST/redirect works; streaming oversized bodies are rejected before parsing; forged headers and cookie resets do not evade limits; private records never enter search, projections or provider calls; concurrent duplicate POSTs and crash recovery create one request; notification failure/retry preserves it without duplicate delivery; invalid conversation attachment does not reject contact or leak history; retention removes the record and associated delivery state; contact details never reach routine logs.

## Per-deployment rollout

Every site verifies its authored-content/rendering integration, writes its `ask-content`, decides on the door, and separately decides on enablement. Authored content alone does not add a renderer to a site that lacks one. Enablement is always last.

### Rizom

1. Merge and release the operator configuration path for per-user `plugins.dashboard.ask`.
2. Merge and import content PR rizom-content#2, after the supporting code is deployed, then rebuild preview through the running app.
3. Enable the Ask tab. This is an owner choice and does not authorize guest execution.

### yeehaa.io

Served by `@brains/site-professional` from the yeehaa rover deployment. The homepage is the Brain itself: a full-screen atlas of everything the owner has published, drawn as topographic terrain from the topics knowledge map, with the owner's authored opening and the visitor's next move floating over it. The page addresses organizations whose knowledge is their asset, and its single outcome is a conversation with the owner. Rizom appears as the current work, not as the subject of the page.

Design study: [`docs/design/yeehaa-landing-redesign-mockup.html`](../design/yeehaa-landing-redesign-mockup.html). Five states: landing, answer, talk to me, before chat, contact. Its state switcher, simulated answer and topic placement are design references, not production features. It supersedes `yeehaa-landing-dialog-mockup.html`, which is deleted.

Shipped in PR #351: the opt-in `homepageOpening` site config, build-time loading of public `ask-content`, and the contact door, rendered only beside a matching live form route. Unconfigured deployments keep their current homepage.

1. **Static atlas.** When `homepageOpening` is on and the opening loads, the homepage renders the atlas instead of the hero and lists. No JavaScript.
   - Data: the homepage datasource adds the knowledge-map projection (`buildKnowledgeMapData`, exported from `@brains/topics`). It keeps only points whose post, deck or project is returned by the build's scoped `listEntities`, so production drafts and private entities drop out, and carries `entityType`, `metadata.slug` and year so site-builder enrichment supplies URLs and type labels. Zones without a shown member are dropped. Missing embeddings or an empty projection render the opening and door without terrain.
   - Terrain: contours are computed at build time by marching squares over a field of zone and item bumps in the unit square, and server-rendered as SVG. Markers are links placed in the same normalized space; zone names label the territories.
   - Opening and door: the `ask-content` title and Markdown introduction with owner attribution; topics and the contact action link to the contact form. Every word around them is authored too: `ask-content` carries optional `topicsHeading`, `contactLabel`, `contactNote`, `attribution` and `mapCaption`. Unwritten copy is left out; the contact action falls back to "Contact".
   - Layout: shared header and footer; the atlas fills the first viewport; on desktop the conversation column sits over the left of the map, on phones the map is a band above the opening. Shared theme tokens only, both themes.
   - Tests first: the atlas renders only when opted in; drafts and private entities are absent; markers link to entity URLs; empty zones are omitted; without map data the opening and door still render; contour output is deterministic and bounded; the page carries no scripts and makes no chat request.
2. **Living terrain and touch.** Each contour ring drifts a fraction of a pixel on its own phase, so neighbouring rings slide against each other; the CSS animation steps a few times a second instead of repainting every frame, keeps lines anti-aliased (a displacement filter aliases them), and is off under reduced motion. A small runtime script, shipped only with the atlas, pauses the drift off screen and in hidden tabs, and handles touch: devices without hover get no hover styles, the first tap opens the nearest mark's title card within a fingertip (hit targets overlap on phones) and the second follows its link. Mouse and keyboard keep hover and focus cards.
3. **Chat in the atlas.** Built and verified on the running app with the local-test preset; production guest access stays off until Slice C. When a public Web Chat route serves the shared box boot (preview-enabled, for a preview build), the atlas renders the ask-box host in the conversation column: a disabled composer that the boot enables, mounting the shared guest box on engagement and never sending on its own. The host opts into Web Chat's shared box presentation, themes it with the site tokens and hides the box's welcome, because the page already presents the opening and topics. Topics fill the live draft; while the box is off they stay links to the contact form. Web Chat reports each finished answer's sources (`type:entityId`, the map's own key) with an `ask:sources` event; the map lights them, dims the rest and zooms around them only as far as keeps each clear of the edges and the header. The contact door stays outside the chat mount and survives unavailability and exhaustion. Remaining: leader lines from the answer's source list to the marks on desktop. Guest enablement remains a separate authorization with its own allowance, ledger and spend.
4. **Deployment and review.** Write the approved `ask-content`, enable contact and `homepageOpening` in the yeehaa deployment's site config, rebuild preview through the running app, capture phone and desktop in both themes, and review with the owner before publication. Do not substitute a package build or the study for preview evidence.

Open items before this deployment's page is published:

- **Introduction copy.** The headline "Building something inhabitable." is accepted. The introduction draft ("I work on how institutions hold what they know. Everything I've published is on this map. …") awaits the owner's markup.
- **Topic placement** comes from the Brain's projection. Review the real zones and labels in preview; the study's six territories are illustrative.
- **Nav and entity labels** on this deployment come from its brain configuration, not from the site package. Confirm the labels the page assumes before relying on them.

## Explicitly deferred

- additional providers/models or a universal provider/proxy framework;
- automatic recovery of lost first responses or credentials;
- uploads, approvals, private context, automatic memory ingestion, or any guest write to Brain content;
- activity-based renewal and broader credential-recovery UX;
- operational dashboards beyond the Slice B guest-usage workspace, or scale work beyond a selected launch deployment; and
- the paused elapsed-time/clock patch, which requires its own necessity and privacy review.

## Completion

Delete this plan after the bounded usage record and its Studio monitor are in place, each deployment's content, door and enablement decisions are made and verified through its running app, the production policy is explicitly approved wherever guests are admitted, and the shipped behavior is captured in Web Chat, Dashboard and site documentation and changelogs.
