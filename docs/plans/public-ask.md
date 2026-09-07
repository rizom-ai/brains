# Plan: Public `/ask` and the Brain landing-page chat

Last updated: 2026-09-13

## Status

**Implementation and preview rollout are substantially complete; live acceptance and production activation remain open and unapproved.**

Shipped and verified with synthetic providers:

- a server-owned guest identity and isolated conversation scope;
- default-off guest admission and a localhost-only test preset;
- atomic issuance, request, concurrency, turn, retention, and spend accounting;
- public-only context with an explicit read/search allowlist;
- owned send, follow-up, history, retry/status, expiry, and deletion paths;
- safe Markdown plus bounded public source cards;
- the standalone `/ask` presentation and the existing Brain-page hero box using the same guest runtime;
- fail-closed handling for ambiguous first sends, lost credentials, unsupported browsers, and uncertain remote completion; and
- packaged/browser/canary checks against the published core/site pair.

The Rizom deployment now runs core `0.2.0-alpha.372` with `@rizom/site-rizom-ai@0.2.0-alpha.251`. The paired landing content is present, operational health is green, the queue is idle, and the production page remains unchanged. Guest admission is still omitted and therefore off.

The latest site deployment did not rebuild preview. Preview still needs an authenticated app-managed rebuild and inspection to prove that the deployed output contains the corrected shared map styling. The available live MCP credential was rejected; authentication was not bypassed.

The user-reported localhost question succeeded, but independent live verification did not complete the question/follow-up/history/deletion sequence or verify provider billing. A further paid run requires fresh approval; no prior reservation or allowance may be reset or treated as continuing authorization.

## Next milestone

A visitor can open `/ask` without an account in an isolated canonical test app, ask a real question grounded in public sources, ask a follow-up in the same conversation, refresh owned history, and delete that conversation, with truthful failure and expiry behavior.

This milestone does **not** enable production guests or publish a new production page.

### Remaining acceptance work

1. **Rebuild the deployed preview.** Use the running app's authenticated command surface, not a static package build or copied output. Verify the actual `dist/site-preview` result, populated map styling, Brain hero layout, source presentation, both climates, and phone/desktop behavior. Confirm production output is unchanged.
2. **Approve one fresh live test.** Before any provider call, confirm the isolated corpus, supported OpenAI model/profile, current prices, request bounds, embedding/background work, and a new explicit spend ceiling. Keep the listener on trusted loopback transport.
3. **Run the real browser flow.** Independently observe the first answer, one follow-up, source cards, refresh/history, and owned deletion. Record sanitized provider/accounting evidence and stop the app immediately afterward.
4. **Exercise honest failure states.** Verify partial/disconnected delivery, known-locator retry/status, expiry, denial, and deletion races without replaying ambiguous work or promising remote cancellation.
5. **Review the experience.** Present the actual preview and live-flow evidence before requesting any production policy, publication, or guest-enablement decision.

## Launch gates

Before unattended public access:

- approve exact provider, spend, request, concurrency, issuance, retention, timeout, cleanup, and disclosure policy;
- validate the HTTPS/origin/proxy posture and network-level abuse controls;
- verify shared transactional accounting for every production replica;
- verify cleanup throughput and admission behavior during unhealthy storage or maintenance;
- document recovery for uncertain execution and credential work without refunding or releasing reservations based only on elapsed time;
- verify the kill switch, already-running work behavior, authenticated Chat regressions, operational visibility, backup, and rollback;
- publish production output only after explicit preview approval; and
- obtain separate explicit authorization to enable guest admission.

Passing tests, deploying packages, pushing content, or building preview does not satisfy these gates.

## Product scope

`/ask` is a public encounter with Rizom's actual Brain:

- no account is required after production guest admission is explicitly enabled;
- answers and synthesis use public Brain knowledge and may include validated public sources;
- visitors may supply question text but cannot edit Brain content, publish, administer, schedule work, approve actions, upload files, call arbitrary URLs, or access operator tools;
- visitor conversations remain isolated and do not automatically become Brain knowledge; and
- the Brain-page hero box and standalone `/ask` continue the same owned conversation under identical policy.

It is not a scripted sales bot, a support-only interface, public Studio access, or a second chat engine.

## Non-negotiable boundaries

### Identity and authorization

- Guest credentials are opaque, server-owned, and held only in secure HTTP cookies in production; URLs and browser storage carry only bounded locators.
- Conversation IDs are locators, never authorization. Forged, foreign, expired, or deleted conversations reveal no content.
- Signed-in owner authority does not upgrade the guest surface.
- Public visibility filtering happens before context, excerpts, metadata, attachments, or tool results reach the model.
- Installing another plugin never grants its tools to guests automatically.
- Browser input cannot supply roles, system instructions, operator context, approvals, tool permissions, or owner identity.

### Accounting and lifecycle

- Capacity is reserved transactionally before generation. Cookie resets, tabs, retries, restarts, and replicas must not evade limits.
- Disconnection, timeout, expiry, or local abort is not proof that provider work stopped. Preserve uncertain reservations and report that truthfully.
- Retries require a known conversation locator and submission identity. Losing both credential and locator is deliberately unrecoverable; the UI must not replay the request.
- Retention cannot be extended by resume or policy loosening. Deletion/expiry prevents late writes from resurrecting a conversation.
- Raw prompts, replies, credentials, and conversation identifiers stay out of routine logs and analytics.

### Presentation

- Render safe Markdown and reviewed source cards only; reject executable HTML, unsafe links, unsupported actions, and fabricated citations.
- Keep submitted text and received partial output visible on failure. Retry is deliberate and deduplicated.
- Distinguish waiting, stopped waiting, disconnected, complete, unavailable, expired, deleted, and limit-reached states.
- Topic suggestions fill the composer but never submit automatically.
- No generation occurs on page load, availability checks, focus, navigation, or recovery.

## Supported test posture

The only approved implementation shape for a live acceptance request remains:

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

## Explicitly deferred

- additional providers/models or a universal provider/proxy framework;
- automatic recovery of lost first responses or credentials;
- uploads, writes, approvals, private context, or automatic memory ingestion;
- activity-based renewal and broader credential-recovery UX;
- richer operational dashboards or scale work beyond a selected launch deployment; and
- the paused elapsed-time/clock patch, which requires its own necessity and privacy review.

## Completion

Delete this plan after the real acceptance flow passes, the production policy and page are explicitly approved, guest access is enabled with operational evidence, and the shipped behavior is captured in Web Chat/site documentation and changelogs.
