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

## Prior declarative SDK integration — historical local validation

The SDK worktree rebases this implementation onto main `b1205927b2` without restoring the retired Web Chat or webserver classes. Guest routes use the declarative route contract; maintenance uses the shared scheduler through the declarative daemon lifecycle and drains active work on shutdown. Interface bookkeeping stays owner-qualified, with no adoption or pruning of retired namespaces.

Overlap regressions protect guest exclusion from SDK bulk conversation reads and change cursors, atomic state replacement with parsed snapshots and wire inputs, trusted socket metadata across request admission, and the runtime listener's `http.hostname`. The Brain landing resolves the installed package-scoped network data source and ships its compiled empty-state styles.

Local checks passed: 105 workspace typecheck tasks, 103 test tasks, 96 lint tasks, seven packed compatibility scenarios, seven surface tasks, script tests, and architecture/static checks. The packed suite rebuilds its own site through a running app; the Rizom-specific network checks here are source/SSR checks, not a new canonical Rizom preview or browser run. This evidence is not exact-registry, live-provider, billing, or deployment acceptance. This is historical local evidence; subsequent commits and CI evidence are tracked on PR #301. Earlier rollout authorizations do not authorize publishing or deployment from this worktree.

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

Local guest routes require trusted loopback socket metadata from the HTTP host. The runtime HTTP host captures Bun’s `requestIP` from the original request, preserves it across the shutdown-signal request clone, and supplies a detached, frozen `transport` snapshot to declarative routes; missing or non-loopback peers fail closed, regardless of Host, Origin or forwarding headers. Other hosts must supply trusted transport context to serve local guest routes. Bind the runtime listener with `http: { hostname: "127.0.0.1" }` in `brain.yaml` as defense in depth; the retired webserver plugin is not restored. Keep embeddings enabled: guest query embeddings are prepaid inside the turn cap, separately from background indexing. Runtime accounting and atomic admission still gate execution. No production preset or public-launch approval is implied.

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
- Move the site-owned chat boot script and its required host DOM contract into shared Web Chat presentation code before adding the professional homepage consumer. Reuse the existing guest runtime and authored-content contract rather than copying the Rizom site's script or maintaining a second composer.
- Every launch gate above applies. Enablement stays a separate explicit decision per deployment, and preview is where each change is verified before the production deploy.
- Tests first: every consuming site passes the shared mount/DOM contract; a production-origin request is denied until explicitly authorized; exhaustion degrades to the unavailable state without losing the visitor's draft or the independent contact link.

### Slice D: a door to the owner

Goal: a visitor can reach the owner without an account and without the chat runtime.

**Worktree progress, not released:** `plugins/contact` now composes the restricted entity and service, with explicit default-off policy, readiness-gated no-JavaScript routes, atomic admission/storage caps, and conditional persistence. A durable notification job uses bounded CAS attempts/leases and a fixed first-attempt retry window; known acknowledgements are repaired into entity status without resending, including late acknowledgements after a failed projection. Notifications contain only a generic alert and a same-origin Studio Inbox link. The notifications plugin's internal subscription now works in execution-only workers. Startup and shell-owned daily maintenance recover pending enqueues and delete expired records plus their delivery ledger state; uncertain writes never regain capacity merely through elapsed time. Failed or overdue maintenance closes intake, and aggregate operational health reports pending/failed work without contact details. The canonical catalog exposes contact only for explicit addition, and the professional site has an opt-in authored opening that appears only beside a matching live form route. Tests use synthetic transport and temporary SQLite connections, covering restart, competing workers, duplicate/conflicting posts, bounded reads, lost acknowledgements, cleanup failure, and server-rendered homepage behavior. No deployment has enabled intake: deployment configuration, verified private sync/backup and proxy policy, approved retention/deletion lag, running-app visual review, and preview acceptance remain outstanding.

- A declarative service package owns the `contact-request` entity and its service, declares a pull-based inbox source, and mounts narrowly scoped public form GET/POST handlers through `defineRoute`. No existing plugin's domain covers contact. The inbox is a pull-based source registry, not a "create inbox item" call.
- Do not use a tool-backed HTTP bridge for intake: it parses the whole body before invoking a tool and forwards neither cookies nor trusted network metadata. Web handlers already receive the raw request and socket metadata. Keep intake out of the public tool catalog; the newsletter route is a form/redirect precedent, not an abuse-control precedent.
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

Served by `@brains/site-professional` from the yeehaa rover deployment. The homepage today leads with an essay-site hero and gives a visitor no way to act. The intent is that the homepage reads as the first turn of a conversation: the owner's authored message opens it, the visitor's next move sits under it, and a visitor who wants a person can reach one. The page addresses organizations whose knowledge is their asset, and its single outcome is a conversation with the owner. Rizom appears as the current work with a link out, not as the subject of the page.

Design study: [`docs/design/yeehaa-landing-dialog-mockup.html`](../design/yeehaa-landing-dialog-mockup.html), built on the live site's tokens and section structure. Two states, landing and after a question. Static, no requests beyond fonts. Its state switcher and simulated replies are a design reference, not production features.

1. Add explicit `site-professional` homepage integration: load only public, valid `ask-content` in the build datasource, carry it through the template's data schema, and server-render its title, Markdown opening and topics. Reuse the shared content contract; add no profile fields or parallel authored-copy schema. This does require datasource, rendering-contract and layout changes. It must not fetch a guest session or depend on guest admission to display authored copy.
2. Keep the new homepage placement explicitly opt-in through this deployment's site configuration, separate from the presence of `ask-content` used by other surfaces. Unconfigured deployments retain their current homepage. Within the opted-in placement, missing/private/invalid Ask copy is omitted, never replaced with generated or profile-derived welcome text. Preserve the existing short metadata description independently of the opening.
3. Write the approved `ask-content` and enable the Slice D plugin/form for this deployment. Render a contact link independently of chat; until the composer is enabled, topic hints link to that working form rather than inert controls. Ship the authored opening and door together, with no composer or promises of answers before C. Form availability must be explicit so a missing plugin cannot produce dead links.
4. **Implement the yeehaa.io visual design as a first-stage deliverable, not just data wiring.** Use the design study's editorial composition for the authored opening and working door; this work does not wait for guest chat:
   - Build the conversational hero: headline hierarchy, Markdown opening, owner attribution, suggested-topic links and a clear contact action directly beneath the opening.
   - Style the real contact form and its validation, rate-limit, unavailable and confirmation states, including the no-JavaScript result pages. Use proper labels, visible keyboard focus, readable contrast and clear saved-versus-delivered wording.
   - Preserve the site's distinctive typography, whitespace, rules and numbered editorial sections using shared theme tokens and existing UI components where appropriate. Integrate with the existing header/navigation and real essay/presentation content; do not hardcode mockup copy, sample posts or raw palette values into the site package.
   - Implement responsive phone and desktop layouts in light and dark themes, including long copy and wrapping topic links. The first-stage page has no composer, simulated thread or chat/privacy promises borrowed from the mockup.
5. **Verify behavior and review the rendered design.** Tests first: valid public copy renders with JavaScript disabled and guest admission off; missing/private/invalid copy is omitted; other professional deployments are unchanged; Markdown is safe; topics reach the form; page load performs no chat request or generation. Start the canonical app and rebuild preview through its authenticated command surface. Capture the actual homepage, contact form and result states on phone/desktop in both themes; compare them against the study, with the contact-only differences explicit. Review typography, spacing, hierarchy, overflow, keyboard access and form feedback with the owner before publication. Do not substitute a static package build or the mockup itself for preview evidence.
6. After Slices A through C, integrate and style the shared composer and conversation states, then switch topic hints to draft-filling without auto-submit. This later visual pass covers attribution, sources, disclosure and failure/exhaustion states without introducing a second chat UI. Guest enablement remains a separate authorization for this deployment, with its own allowance, ledger and spend. The contact link stays outside the chat mount and survives unavailability/exhaustion. Verify runtime-derived privacy/retention disclosure rather than copying the design study's obsolete privacy promises.

Open items before this deployment's page is published:

- **The copy is not accepted.** The draft opens with "AI that stays yours" and replaces the live headline "Building something inhabitable" outright. The owner has not marked it up.
- **The implemented visual design needs preview approval.** Agreement on the study does not approve the generated page; review the contact-only homepage and form evidence from step 5 before publication.
- **Proof is asserted, not shown.** The draft claims first organizations are using Rizom and cites prior work. Resolve with one named organization when that is permitted, or a link from the prior-work line to a written account of what was built.
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
