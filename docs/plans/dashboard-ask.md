# Dashboard Ask: shared authored content and guest presentation

## Status

Implemented on `feat/dashboard-ask`; not merged, released, activated or published.

## Decision

Ask is an optional public dashboard tab, not owner Chat and not a second chat engine. The approved mockup is a design reference; its state switcher, sample conversations and simulated replies are not production features.

A dedicated `ask-content` singleton owns the authored welcome and suggested topics. It is independent of site pages. The entity package owns storage/schema registration; the shared Ask contract is consumed by Web Chat, which owns the presentation and HTTP boundary. Neither Dashboard nor Web Chat may depend on the Rizom Brain-page hero schema.

Missing or invalid optional content means no welcome or suggestions. No invented fallback prose, promotional defaults, implicit generation or page-specific copy shims. Only public entity content may reach a public visitor. Privacy, availability, expiry and limits come from runtime policy, never this entity.

## Implementation sequence

1. Add the bounded shared Ask content contract and markdown-backed singleton entity; register it through the existing canonical entity/plugin system. Test parsing, absence, malformed content and public visibility.
2. Expose the optional presentation through the existing guest bootstrap response after the existing admission checks. No new execution path or allowance ledger.
3. Make the standalone and embedded guest presentations use this shared content. Remove their hardcoded welcome/topics and Brain-page copy dependency. Preserve the existing conversation state machine, drafts, safe Markdown, sources, uncertain-send handling, owned history/deletion and runtime disclosures.
4. Add the optional dashboard tab using an explicit owner setting, default off. Web Chat owns its client assets/mount; Dashboard owns tabs and surrounding chrome. Mount once, lazily when selected; tab switching must not reissue sessions or discard drafts. Opening full Ask on the same origin uses the existing owned conversation locator, never an ID as authorization.
5. Use the dedicated entity as the only authored source across `/ask`, Dashboard and Brain-page chat. Existing approved copy may seed it once via a reviewed content change; do not mutate hosted content or keep a legacy hero-copy fallback.
6. Verify focused contracts/entity/HTTP/UI/dashboard/site tests first, then affected workspace typecheck/lint. For rendered app acceptance use a canonical test app and authenticated app-managed preview rebuild with synthetic providers. No paid requests.

## Acceptance boundaries

- Ask's visibility setting does not enable guest execution, renew credentials, reset limits or change public-only permissions.
- No user-facing feature toggle in the public tab; the mockup opens Ask directly.
- No model call or automatic message on mount, tab selection, topic selection, reload or recovery.
- Missing content and unavailable access render honestly.
- Signed-in viewers must not silently elevate guest chat to owner Chat.
- Production activation, publication, release and deployment remain separate approvals.
- Preserve the updated mockup, existing dirty docs and unrelated worktrees.

## Progress

- [x] Inspected current Dashboard, Web Chat and site composition boundaries on current `origin/main`.
- [x] Isolated branch/worktree: `feat/dashboard-ask`, `brains-worktrees/dashboard-ask`.
- [x] Corrected the plan: dedicated Ask entity, not a dependency on Brain-page content.
- [x] Shared content contract and markdown singleton entity, registered in the canonical core.
- [x] Guest bootstrap and shared presentations; private/missing/malformed copy is omitted.
- [x] Optional dashboard tab and canonical site integration; removed hero-copy dependency.
- [x] Focused checks and synthetic app/browser acceptance.

## Verification

- Focused suites: 560 tests passed; canonical membership suites: 21 passed.
- Full repo checks: 103 typecheck tasks, 95 lint tasks and 101 test tasks passed (existing opt-in packed/live tests remain skipped).
- Canonical `start:publishing` fixture used isolated storage/auth, synthetic credentials/providers and a preload blocking external fetches. Preview was rebuilt through the running app's authenticated MCP surface.
- Browser verified zero credential issuance on Overview, one mount on Ask selection, editable topics without sending, draft preservation across tab switches, shared authored content on standalone Ask, and no mobile overflow.
- One synthetic question completed through the actual guest runtime. Navigating to Full chat restored the owned answer without another send. No live provider requests were authorized or made.
- App verification found a missing packaged-asset copy step for the new dashboard bundle. The CLI build now includes both dashboard assets; the canonical app was restarted against the same preserved fixture and allowance, then the check passed.
- Local fixture/evidence: `/tmp/dashboard-ask-app.KeWOe8`; checks: `/tmp/dashboard-ask-*.log`. The bounded test app was stopped and its canonical configuration restored.

## Rollout gate

Prepared the dedicated public `ask-content/ask-content.md` in the separate content branch `feat/shared-ask-content` (commit `eb6a8a7`, local only). Its title, introduction and topics exactly match the current user-edited mockup; no sample answers, citations, state messages or privacy limits were migrated. The same commit removes only the obsolete `hero.chat` section. No live content migration was performed.

Rollout order: review both changes, release/deploy the supporting core and site versions first, then merge/import the content migration and rebuild preview through the running app. Do not merge the content change before the supporting code: the older site still requires `hero.chat`. A rollback to that site version must restore the old content section too.

Enabling `plugins.dashboard.ask` remains a separate owner choice, and does not authorize guest execution. Deployment, content publication and production-page publication still require approval.
