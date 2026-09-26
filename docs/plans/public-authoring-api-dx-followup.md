# Plan: Public authoring API boundary and DX follow-up

## Status and scope

**Reopened by [Phase 6](#phase-6--outside-author-audit). The five bounded
checks after `d3ed1895a9` are closed, and the stopping rule they set — a
concrete authoring failure reopens the work — was met: an outside-author
package built from the guide against the packed tarball produced eight
demonstrated failures, three of them blocking. Phase 6 lists them as slices,
tests first. This does not imply merge, exact-registry evidence, publication,
or stable nomination.**

### Validated continuation checkpoint

Commit `d3ed1895a9` collects the completed continuation work after `6b1efb3f88`: response
inference, shared errors and job/batch follow-through, runtime capability and
metadata projections, state/upload owner isolation, and UI build-race fixes.
Validation passes with **33 public SDK tests**, **103/103 typecheck**, **101/101
test**, **96/96 lint** tasks, **7/7 fresh packed scenarios**, and the complete
surface/static/documentation gate set.

The historical **uncommitted** labels and no-commit statements below describe
each slice when recorded; their completed changes are included in this checkpoint.
At that checkpoint the callback and obsolete-path inventory remained open;
the bounded close-out below records its subsequent disposition. The checkpoint
alone was not final DX sign-off, exact-registry evidence, publication, or stable
nomination.

### Bounded close-out checklist after d3ed1895a9

Do not reopen the validated inference, state/upload ownership, job/batch,
auth/MCP, projection, logger, or metadata corrections without a new reproduction.
The acceptance work was bounded to the following five checks, not an open-ended
search for nicer abstractions. Each is now closed by a contract-to-runtime comparison
and existing or new regression evidence; only demonstrated gaps required code.

| Check | Remaining paths                                                                                                                              | Status / exit evidence                                                                                                                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1    | Supplementary service setup/reaction namespaces: views/templates, entity shapes, publishing, health/readiness, and returned descriptors.     | Closed, corrected. View script/asset metadata was shared with the registry: detach it and use the real renderer registry in the harness. Public SDK and `templates/test/renderService.test.ts` regressions pass. Entity shapes, template capabilities, publishing and readiness return their declared operations/data.                                  |
| C2    | Specialized entity callbacks: attachment factories, insights, dashboard surveys/semantic reads, creation/publication hooks.                  | Closed, corrected. Attachment factories now receive four declared media members with frozen bound readers; the public SDK regression proves reads and rejects host/mutation authority. Insights, dashboard surveys/semantic reads and creation/publication callbacks construct their declared capabilities explicitly.                                  |
| C3    | Remaining interface/message callbacks: daemons and health, account iteration, receiver/listen, send/edit/progress/presentation/delivery.     | Closed without changes. `declarative-daemon.ts`, `account-daemon-supervisor.ts`, and both interface implementations construct explicit arguments; health exposes ready/warning, not controllers. Existing interface/message, account, route and packed Phase 5 regressions cover execution and lifecycle.                                               |
| C4    | Operator/contribution/advanced paths: account-settings redaction, workspace/widget handlers, infrastructure opt-in, and rich template entry. | Closed without changes. `operator-context-runtime.ts` redacts secret settings; workspace/widget runtimes bind scoped operations. Infrastructure facts/mirrors require explicit opt-in. Operator/workspace tests and standalone account-settings/operator consumers cover these paths. Rich templates retain rendering definitions, not host registries. |
| C5    | Acceptance reconciliation: removed APIs/aliases, coded-error consumers, public export audience, and final checklist.                         | Closed, corrected; final gates pass. Remove the unused internal `reconcileEntities` implementation/export. Auth reports absent anchors as `not_found`; Admin no longer matches error text. Real auth/Admin regressions cover changed wording and rejection of message-only lookalikes.                                                                  |

The remaining `runtimeTemplates()` is the current single-template compiler, not
the removed templates/views merge path. Scoped package IDs and contributor
`.bind` are intentional retained decisions (H and I were withdrawn), as are the
simple/advanced projection families and internal runtime classes. Native network
and Git CLI error-text checks are not SDK error-code consumers. Searches found
no remaining production consumers or implementation of the removed reconciler.

All five rows and the implementation-acceptance boxes below are closed. Final
evidence: **35 public SDK tests** through source, built exports, and an isolated
packed consumer; forced **103/103 typecheck**, **101/101 test**, **96/96 lint**
tasks; **7/7 fresh packed scenarios** (including the running-app site rebuild);
and the complete surface, boot, static, docs, formatting, and diff gates.

Reproductions and gate logs are recorded under `/tmp/plugin-dx-next/closeout-*`.
Durable regressions are in `packages/brain-sdk/test/testing-entry.test.ts`,
`shell/templates/test/renderService.test.ts`,
`shell/auth-service/test/administration-contract.test.ts`, and
`plugins/admin/test/people-workspace.test.ts`. The changeset and external guide
record the observable corrections. No state keys, upload paths, saved content,
or migration policy changed.

There is no remaining implementation acceptance work in this plan. New cleanup
requires a reproduced authoring failure or a supported consumer need. Exact-registry
evidence, publication, and stable nomination remain outside this close-out.

### Internal DX continuation after 6b1efb3f88

Known defects are addressed and verified internally; external feedback is not a
gate or a substitute for resolving reproduced defects.

- [x] Replace the inline literal-response workaround with sound const return
      inference for routes, tools, and subscriptions. Preserve schema input
      constraints while accepting immutable record/array/tuple answers. Positive
      and negative probes cover sync/async handlers, unions, tuple positions,
      transformed outputs, and nominal objects. Remove the golden health route
      annotation and the subscription test's literal-return annotation.
- [x] Narrow the runtime subscription entity object, not just its declared type.
      A public-harness probe found `createEntity`, `updateEntity`, and
      `deleteEntity` reachable from a nominal reader. Every subscription family
      now receives only frozen `getEntity`, `listEntities`, and `getEntityTypes`
      methods, with positive read and negative capability tests.
- [x] Complete the accepted shared-error disposition (F), including its named
      boundary consumers and job/batch follow-through. This is a bounded shared
      contract, not an exhaustive taxonomy of arbitrary third-party exceptions.
      One shared `SdkErrorCode` schema and `SdkError` now replace the message-only
      and upload-specific families. Declared tools, typed requests, HTTP failures,
      MCP runtime envelopes, and durable job readers preserve codes and sanitize
      unclassified exceptions. SQLite stores `lastErrorCode` alongside safe text;
      completion clears both. Server-side status readers sanitize old/unknown codes.
      Regressions cover independently bundled copies, changed diagnostic wording,
      JSON serialization, real HTTP, worker validation/deadlines, terminal hooks,
      and reopened SQLite. Terminal hooks require successfully parsed input.
      Known application refusals opt into a bounded `publicMessage`, separate
      from diagnostic `message`/`cause`; raw provider errors remain private.
      Migrate stale playbook and duplicate-workspace refusals to `conflict`,
      and classify known invalid inputs, missing resources, and denied host
      registrations without matching message text. Mid-flight cancellation
      uses the authoritative signal even when its reason is a plain `Error`.
      Packed testing caught over-broad MCP normalization hiding an intentional
      duplicate-entity refusal: explicit native/protocol responses must remain
      intact, with sanitization at the actual exception-catching boundary instead.
      Batch status/progress now carry shared `{ code, message }` records rather
      than raw stored strings. Missing children, unknown codes, and failed rows
      with no diagnostic get safe coded failures. Schema-valid declared job
      refusals complete as domain data; native handlers keep their active
      controlled-failure protocol. Malformed durable JSON reports `invalid_input`.
      Error and terminal callbacks reuse the attempt's prepared input instead of
      reparsing defaults/transforms. Remove the unused internal `BatchJobData`
      schema; this does not add durable batch coordination or compatibility shims.
- [x] Finish the whole-surface runtime-capability audit. The export ledger's
      removed names are not proof that narrowed callbacks receive narrowed
      objects. Check ordinary callback objects and named advanced consumers;
      keep actual obsolete-path removal distinct from legitimate protocol and
      host-specific capabilities. Classify `inboxFollowUps.registerKind` as an
      intentional setup capability: Studio and web-chat own destinations and
      register them there. Its plugin-bound namespace and registry finalization
      guard are supported by the existing registry and consumer tests; it is not
      a nominal-reader leak. The bounded C1–C5 table above supersedes this
      historical open inventory.

#### Runtime-reader continuation (uncommitted)

The next probes reproduced additional differences between callback types and actual
objects. Shared internal projections now bind the allowed methods to their original
receivers instead of forwarding larger runtime objects:

| Callback boundary                                              | Actual correction                                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordinary service setup and reactions                           | Permission checks no longer expose principal replacement or deployment principal seeds.                                                                                                    |
| Service/interface/message-interface setup                      | Profile selection exposes `getResolved`, not kind registration or the selected definition.                                                                                                 |
| Service/entity jobs                                            | Uploads expose `read`; attachments expose `resolve`; identity exposes `getProfile`.                                                                                                        |
| Job, check, agent-context, and evaluation conversation readers | Expose the declared three read methods instead of the larger conversation namespace.                                                                                                       |
| Interface and subscription identity readers                    | Expose `get`/`getProfile`, not deployment metadata; service setup retains its declared `getAppInfo`.                                                                                       |
| Entity create resolvers                                        | Preserve their declared `readRecord` and `read`, without upload mutation.                                                                                                                  |
| Scoped upload writers                                          | Keep their declared writer methods, but hide mutable implementation options and reject path traversal in declaration namespaces.                                                           |
| Scoped durable state                                           | Hide the database, schema, and mutable namespace behind a frozen bound facade. A real SQLite probe previously redirected writes into another scope by changing the hidden namespace field. |

The in-memory harness now freezes state handles as production does. Host APIs and
intentional interface writer capabilities remain available to their legitimate
owners. This does not claim to sandbox arbitrary plugin JavaScript.

A separate mapping probe confirmed that `@scope/pkg` and `scope.pkg` both mapped to
`scope.pkg.cache`. The package-owner continuation below resolves that collision
without changing the keys used by current workspace packages. The upload traversal
probe is fixed without renaming valid namespaces. Reproduction evidence is under
`/tmp/plugin-dx-next/*capability*`, `namespace-mapping-audit.log`, and
`upload-namespace-repro.log`.

**Validation:** **26 public SDK tests** pass through source, built exports, and
an isolated packed consumer. Fresh forced gates pass: **101/101 test tasks**,
**103/103 typecheck tasks**, **96/96 lint tasks**, and **7/7 freshly built packed
compatibility scenarios**. Surface/declaration, checked examples, boot, and the
full static/format/diff gate set also pass. Evidence is in
`/tmp/plugin-dx-next/capability-*`. No commit or push has been made. The confirmed
remaining whole-surface inventory stays open; package-owner collision follow-through
is recorded below.

#### Package-owner namespace continuation (uncommitted)

An inventory of all **99 workspace package names** found only ordinary
`@scope/name` forms with no dots in either component. A byte-for-byte comparison
of their old and new physical namespace keys found **zero changes**. No `runtime-state.db` was
found in the checked main-worktree and review-worktree data directories. This is
local evidence only, not a claim about deployed installations.

Preserve the existing canonical keys for those ordinary scoped names. Encode other
owners as `package:<base64url-owner>:<namespace>`, with a distinct delimiter that
cannot collide with the ordinary scoped form. This separates unscoped names,
dotted scoped components, and owner/namespace suffix ambiguities. Reject malformed
Unicode rather than letting UTF-8 replacement collapse distinct owner strings.

No existing rows are moved or copied, and there is no fallback to old shared keys.
An old collapsed row cannot identify its original owner. Installations using the
affected names require ownership review before any migration; current workspace
packages do not need a key migration for this correction. Real SQLite tests seed
pre-change keys, reopen the database, prove ordinary keys are still read, and prove
ambiguous rows remain untouched rather than being adopted by encoded owners.

This closes the demonstrated **package-versus-package** mapping collision only.
The interface/package overlap is addressed in the cross-family continuation below;
the remaining callback/return-object inventory stays open. Evidence:
`/tmp/plugin-dx-next/namespace-owner-inventory.json`, `namespace-package-repro.log`,
`namespace-existing-key-check.json`, and `namespace-*` check logs.

**Validation:** **27 public SDK tests** pass through source, built exports, and
an isolated packed consumer. Fresh forced gates pass: **101/101 test tasks**,
**103/103 typecheck tasks**, **96/96 lint tasks**, **7/7 freshly built packed
scenarios**, plus surface/declaration, checked examples, boot, and the full
static/format/diff gate set. The full tests were rerun with `--concurrency=1`
after reproducing a separate build/read race: the CLI build rewrote the web-chat
bundle while its test read it, yielding an empty response. Serial execution kept
the same tasks and assertions; it did not fix that scheduling race. No assertions
were relaxed. No commit, push, migration, or publication was performed.

#### Logger and build-race continuation (uncommitted)

A public setup probe exposed logger fields (`fileHandle`, `logFile`, and mutable
configuration), private prototype methods, and the constructor's singleton
controls. The base context now projects loggers once for all plugin families;
pre-registration fallback loggers and recursively created children use the same
frozen bound projection. The declared `setUseStderr` command remains intentional.
Host logger factories are unchanged. SDK regressions exercise setup, reactions,
and service/entity jobs; a direct real-logger test checks receiver binding and
child projection. The named mock entity-context factory records logger calls by
wrapping the projected methods in spies, preserving its audit-assertion behavior
without restoring the backing class. Evidence: `logger-reachable-authority.log`,
`logger-capability-repro.log`, and `logger-*` check logs.

The previous parallel test failure was also reproduced independently: Bun's direct
build output changed an already-open file reader to the next bundle. Web-chat now
builds in a private sibling directory (preserving source-map relative paths), then
publishes each completed asset through an internal atomic file writer. Compilation
failure leaves the old served assets intact. Tests cover an already-open reader,
real Bun output, failed compilation, source maps, and staging cleanup. This is
per-file replacement, not a multi-file release transaction or a claim that all
Studio/CLI artifact publication paths are atomic. Evidence: `asset-inode-repro.log`
and `asset-*` check logs.

The next concurrent run exposed the equivalent Studio deletion race. The CLI now
builds both UIs into its own private destinations instead of rewriting dependency
outputs. The staging directories sit outside published `dist`, preserve the final
source-map depth, and are removed on process exit. Both UI scripts accept a custom
output directory without deleting caller-owned files. New process-level tests
verify generated files and unchanged dependency file identities/timestamps. A real
CLI build separately verified unchanged source UI assets and no remaining staging
directories (`asset-cli-isolation-check.json`). Argument parsing stays in the
shared build-tools package; no architecture allowlist was widened.

The concurrent run also exposed a batch test assuming all enqueue timestamps tied.
Its exact job/owner/root/retry assertions now compare by job type rather than
assuming `getRecentJobs()` is enqueue-ordered. Production ordering is unchanged.

**Validation:** **27 public SDK tests** pass through source, built exports, and an
isolated packed consumer. Fresh forced repository gates pass with **normal test
concurrency**: **101/101 test**, **103/103 typecheck**, and **96/96 lint** tasks.
All **7/7 fresh packed scenarios**, surface/declaration, checked examples, boot,
and static/format/diff gates pass. Evidence is in
`/tmp/plugin-dx-next/continuation-{types,tests,lint,packed,surface,static}.log`.
Changes remain uncommitted; no migration, push, merge, or publication was performed.

#### Cross-family namespace correction (uncommitted)

Historical policy: the preserved undotted-key exception described here is
superseded by the interface owner isolation completion below.

A public harness probe
reproduced `email` with namespace `inbound.uid-cursor` sharing
`email.inbound.uid-cursor` with package `@email/inbound` and namespace `uid-cursor`.
The simulated cursor changed from UID 1 to UID 999 after the package wrote it.
The email namespace is used by the real email interface; its
`inbound.source-locators` namespace has the same structural issue. The conflicting
package is only a probe: the 99 workspace packages use `@brains` and `@rizom`,
not `@email`. This is not evidence of existing corrupted email data.

The owner confirmed that the email interface has **not been used in production**
and authorized direct isolation with **no migration or user upgrade step**. The
earlier proposed migration is withdrawn; neither automatic nor opt-in migration,
nor a legacy-key fallback, is needed for this correction.

Both ordinary and message-interface setup now share `interfaceStateNamespaceFor`.
Flat interface owners with undotted local namespaces retain their one-dot keys
(for example `chat.subscriptions`). Ambiguous forms use
`interface:<base64url-package>:<base64url-declaration>:<namespace>`, separate from
both ordinary scoped package keys and tagged package keys. New tagged keys also
distinguish two packages using the same declaration ID. Existing workspace package state is not
renamed. Public declaration ID validation is unchanged.

The SDK regression first reproduced a package overwriting interface state, then
proved both interface families retain independent cursor and source-locator
stores. SQLite tests cover mixed owner forms across restart, unchanged chat state,
and old ambiguous development rows left untouched and never read by the new
interface handles. Email integration fixtures now seed the new physical locator
key; their Admin, cancellation, and mailbox-generation assertions remain intact.
A longer valid package name exposed the old 128-character physical-key limit, so
the runtime now permits 512 characters while retaining the existing character
rules. SQLite tests cover the longer qualified owner and the 512/513 boundary.
No database schema migration or existing-key rewrite is needed for that limit
change. No migration code or user-data operation was added.

Evidence: `cross-family-namespace-repro.log`, `cross-family-owner-inventory.json`,
`interface-state-repro.log`, and `interface-state-*` check logs under
`/tmp/plugin-dx-next/`.

**Validation:** **28 public SDK tests** pass through source, built exports, and an
isolated packed consumer. Fresh forced gates pass with normal concurrency:
**101/101 test**, **103/103 typecheck**, and **96/96 lint** tasks. All **7/7 fresh
packed scenarios**, surface/declaration, checked examples, boot, and the full
static/format/diff set pass. Logs: `interface-state-{types,tests,lint}-final.log`,
`interface-state-packed.log`, `interface-state-surface.log`, and
`interface-state-static.log`. Changes remain uncommitted; no migration, user-data
operation, commit, push, merge, or publication was performed.

A separate owner-identity probe remains open for the preserved **undotted** form:
two packages declaring the same interface ID still use that same declaration-owned
namespace. Installing
`@fixture/first` and `@fixture/second` with ID `state-owner` and local namespace
`cache` returned the second package's value through both handles. This is an
interface-versus-interface issue, not the package-versus-interface overlap closed
above; the new tagged form does not inherit this limitation. Evidence:
`interface-definition-owner-probe.log`. Do not treat the email
production-use clarification as permission to rename unrelated interface state.

#### Progress and returned-profile capability continuation (uncommitted)

A public job probe exposed `createSub`, `toCallback`, and heartbeat controls on
objects typed only as `ProgressContract`. Service/entity job callbacks and the
direct job-context test helper now share a frozen, bound `report` projection.
Real reporter tests preserve scaling, detached invocation, and callback rejection;
runtime owners keep the original control surface. The distinction between the
minimal `ProgressContract` and full `ProgressReporter` is intentional, not an
obsolete alias; their stale class-era documentation is corrected.

The returned-object inventory also found `ProfileKindRegistry.register()` spreading
the original definition after validating metadata. That leaked undeclared fields
through `getSelectedDefinition()` and evaluated undeclared getters. Registration
now constructs the selected definition from validated metadata and a once-read,
validated fields schema. Tests preserve schema identity, frozen metadata, and the
actual job callback path while rejecting the extra-field leak.

The public harness could not select a profile kind, preventing an external author
from exercising that path. Its new optional `profileKind` setting is explicitly
forwarded to the existing runtime harness. Selection still happens at finalization;
missing registered kinds fail rather than silently falling back. Public SDK tests
exercise selection, job access, extra-field omission, and invalid selection.

Additional inventory disposition:

- Identity results already pass through explicit Zod DTO schemas. Added tests
  verify extra runtime fields are omitted and nested returned data is detached;
  no production change is needed at that boundary.
- Resolved profile metadata and labels are already frozen. Jobs intentionally
  receive the declared Zod fields schema when requesting the selected definition;
  it is not a registry-management capability.
- Conversation readers use fresh database queries and explicit public row/message
  mapping. Their metadata is domain data, not a returned service instance.
- Entity/service AI namespaces already construct the five declared operations;
  structured generation returns an explicit `{ object }` from the shell rather
  than the provider result object. No additional capability projection is needed
  for that object path.

Evidence: `/tmp/plugin-dx-next/progress-capability-repro.log`,
`profile-kind-capability-repro.log`, `profile-harness-repro.log`, and
`progress-profile-*` check logs.

**Validation:** **29 public SDK tests** pass through source, built exports, and an
isolated packed consumer. Fresh forced gates pass with normal concurrency:
**101/101 test**, **103/103 typecheck**, and **96/96 lint** tasks, plus all **7/7
fresh packed scenarios**, surface/declaration, checked examples, boot, and the
full static/format/diff gate set. Evidence: `progress-profile-{types,tests}.log`,
`progress-profile-lint-final.log`, and `progress-profile-{packed,surface,static}.log`.
Changes remain uncommitted. The broader inventory and preserved undotted
interface-owner issue remain open; no state keys or migration policy change in
this continuation. No commit, push, merge, or publication was performed.

#### Returned auth capability continuation (uncommitted)

The interface lookup inventory reproduced another reachable implementation:
`createAuthReader()` narrowed the registry but forwarded each lookup result.
The registered `AuthService` instance exposed its `runtime`, request router,
lifecycle methods, and all other capability families through even `getCaller()`.

The shared author adapter now projects all five lookup results into frozen,
bound method-only views. Lookups still consult the live registry, so late
registration, withdrawal, and re-registration are observed. The internal host
registry and auth-service lifecycle are unchanged. This is not authorization
hardening: the API intentionally still permits explicit administration and
federation lookup, including their declared mutation/signing operations.

A real initialized auth-service test exercises an installed declarative consumer,
checks every view's exact method set, and invokes detached session, user-list,
audit, issuer, and identity methods. The administration list is compile-time
exhaustive. Public SDK negative compile checks reject cross-family methods and
runtime internals through source, built, and packed declarations.

The auth test stub also proved structurally incomplete: spreading its empty
Proxy did not copy any administration operations. Replace that cast-backed path
with explicit throwing methods, so constructing a view works and invoking an
unsupported stub operation fails deliberately.

Other lookup disposition: channel registration already validates and freezes
metadata (including nested subject patterns) and projects delivery providers
into bound `isAvailable`/`send` methods plus channel type. Endpoint and interaction
setup namespaces expose plugin-bound registration commands, not registry lookup
objects. No change is needed for those inspected paths.

Evidence: `/tmp/plugin-dx-next/auth-view-repro.log`, `auth-stub-repro.log`, and
`auth-view-*` checks.

**Validation:** fresh forced **103/103 typecheck**, **101/101 test** (normal
concurrency), and **96/96 lint** tasks pass. All **7/7 fresh packed scenarios**,
surface/declarations, **29 SDK tests** through source/built/packed consumers,
checked examples, boot, and static/format/diff gates pass. Logs:
`auth-view-{types,tests,lint,packed,surface,static}.log`.
The broader inventory and preserved interface state ownership issue remain open.
No state namespace or migration policy changed. Changes remain uncommitted; no
commit, push, merge, or publication was performed.

#### Protocol and projection capability continuation (uncommitted)

Interface context construction forwarded the full MCP service as `IMCPTransport`.
The shared context factory now exposes a frozen, bound transport view, preserving
the optional anchor operation only when supplied. A real MCP-service regression
checks the exact method set, detached setters and server creation, hidden backing
fields/registration methods, and original host authority. Returning the protocol
SDK server is intentional; this is not a sandbox or removal of protocol-host
powers.

The same inventory found base plugin `spaces` aliased the deployment array.
Base contexts now receive frozen copies and declare them read-only, protecting
both interface families and entity creation callbacks that consume that context.
A regression retains the original configured array and verifies isolation.

Following the space reference uncovered an independent projection path: core
passed its full entity service, configuration array, logger implementation, and
five-operation AI namespace into narrower callbacks. Shared input/execution
adapters now provide the seven declared entity read methods, conversation readers,
a frozen space snapshot, the four declared AI methods, and projected loggers.
Core uses them even for directly supplied executable rules; the declaration
helper also applies them when invoked directly. The adapters are private-package
runtime exports, not new public SDK symbols. Execution dependency getters remain
lazy so pure derivations do not acquire unused AI/logging dependencies.
The architecture gate caught a context-type cycle when reusing the existing
reader module. Logger/conversation projections now live in the lower-level
`internal/callback-readers.ts`, with all consumers updated and no forwarding
aliases or architecture exceptions.

Tests cover real core context construction, helper calls, detached readers,
original runtime authority, and source/built/packed public positive/negative
contracts. The worker test now asserts a distinct frozen callback context rather
than requiring the original runtime object's identity; its input, signal,
single-derivation, and reconciliation assertions remain intact.

Additional return-object disposition: Inbox sources validate and project their
methods and item/detail results; follow-up registrations and resolved targets
pass through explicit schemas. Agent chat/confirmation results use the canonical
agent response parser. Interface tool listings explicitly map name, description,
and plugin ID rather than returning registered handlers. No production change is
needed for those inspected paths.

Evidence: `/tmp/plugin-dx-next/transport-view-repro.log`,
`interface-spaces-repro.log`, `projection-capability-probe.log`,
`projection-reader-repro.log`, and `projection-direct-repro.log`.
`projection-capability-fixed.log` confirms the narrowed helper path; focused
checks pass in `projection-runtime-targeted.log`.

**Validation:** **31 public SDK tests** pass through source, built exports, and
an isolated packed consumer. Fresh forced **103/103 typecheck**, **101/101 test**
(normal concurrency), and **96/96 lint** tasks pass, together with all **7/7 fresh
packed scenarios**, surface/declarations, checked examples, boot, and the complete
static/format/diff gate set. Final logs:
`protocol-projection-{types,tests,lint,packed,surface,static}-final.log`.
The wider audit and preserved same-ID interface state ownership issue remain
open. No namespace migration or persisted-data operation was performed. Changes
remain uncommitted; no commit, push, merge, or publication was performed.

#### Registration metadata continuation (uncommitted)

Reader return values exposed two mutable registration records. Entity-type
configuration was stored and returned by reference, including nested publication
statuses; clearing a returned list changed publish-boundary classification.
Attachment metadata similarly aliased its provider's declaration and retained
undeclared fields.

Entity configuration now passes through one private-package validated-copy
operation at declaration/registration and read boundaries. All declared fields
are retained, nested policy data is detached, and undeclared getters are not
read. Validation precedes all registry map writes, so invalid configuration
cannot leave a partially registered type. Runtime-harness configuration uses
the same operation. Returned metadata remains locally editable, consistent with
its existing type; it is not a mutation API for the registry.

Attachment registrations now capture validated metadata and a bound resolver.
Metadata reads return copies. Registration validates before replacing the active
provider, and cleanup removes only the registration that created that handle.
This fixes reproduced stale cleanup deleting a newer provider without changing
the registry's existing replacement policy.

The harness policy regression also exposed its direct executable-rule path
bypassing the projection adapters added in the previous continuation and ignoring
configured spaces. It now uses the same readers and configured space snapshots
as production. Tests install the complete compound package before inspecting
entity policy. The public metadata test waits for registration completion before
looking up an entity's attachment provider; boot order is unchanged.

A forced concurrent test run also caught the directory-sync visibility test
reading an empty file immediately after creation, before its asynchronous write
finished. Its waits now require the expected body, matching the existing later-edit
case. Content assertions and timeouts are unchanged; this does not add or claim
atomic filesystem publication.

Additional disposition: public skills are already parsed from skill metadata
and explicitly mapped into public records, with a permission-filtered tool
fallback. No extra runtime object is forwarded on that inspected path.

Evidence: `/tmp/plugin-dx-next/metadata-boundaries-repro.log` and
`metadata-projection-harness-repro.log`. Focused registry/plugin/SDK checks and
architecture pass (`metadata-boundaries-targeted4.log`,
`metadata-boundaries-arch.log`). Full gates subsequently pass with the interface
owner isolation completion below; its validation covers this continuation too.
The broader audit remains open. No migration or persisted-data operation was
performed in this metadata continuation.

#### Interface owner isolation completion (uncommitted)

The operator clarified that Discord/Slack is barely used in production and no
one relies on its saved thread-following state. Apply the remaining state-owner
correction directly: all interface state now uses
`interface:<base64url-package>:<base64url-declaration>:<local-namespace>`.
Remove the undotted exception rather than adding a migration or legacy fallback.
This supersedes the earlier preservation decision and closes the confirmed
same-ID interface **state** collision.

Inventory correction: the chat package declares separate `discord` and `slack`
interfaces. Its actual old state keys are `discord.subscriptions` and
`slack.subscriptions`; `chat.subscriptions` in earlier examples was illustrative.
Only thread-following/mention-routing settings start fresh. Old rows remain
untouched; chat history, uploaded files, and package-owned workspace keys do not
move. Email's previously encoded keys are unchanged.

Public SDK tests now install two packages sharing an interface ID, covering both
ordinary/ordinary and message/ordinary combinations with dotted and undotted
namespaces, and finalize registration before verifying independent reads.
SQLite tests cover distinct package and declaration owners across restart and
prove old Discord/Slack state is neither adopted nor deleted. Chat adapter tests
assert the local namespace separately from framework-owned global key encoding;
the old fixture-only declaration-key assumption is removed.

Evidence: `/tmp/plugin-dx-next/interface-owner-final-repro.log` reproduced both
public and persisted collisions. Focused plugin/SDK/chat checks pass in
`interface-owner-targeted-final.log`.

**Validation:** **32 public SDK tests** pass through source, built exports, and
an isolated packed consumer. Fresh forced gates pass: **103/103 typecheck**,
**101/101 test** (normal concurrency), and **96/96 lint** tasks, plus all **7/7
fresh packed scenarios**, surface/declarations, checked examples, boot, and the
complete static/format/diff set. This also validates the registration-metadata
continuation already present in the worktree; its fixture received explicit
provider return annotations required by lint. Logs:
`interface-owner-{types,tests,packed,surface,static}.log`,
`interface-owner-lint-final.log`, and `interface-owner-sdk-final.log`.

The wider audit remains open. In particular, upload directory names still use
declaration-ID scoping; state isolation must not be represented as upload-owner
isolation or used to silently rename stored files. No upload ownership change,
namespace migration, commit, push, merge, or publication was performed.

#### Upload owner investigation (decision resolved below)

A filesystem-backed probe installed two packages with the same interface ID and
local upload namespace, finalized registration, and saved a file through the
first. The second package could read it and both handles resolved the same
directory. Evidence: `/tmp/plugin-dx-next/upload-owner-probe.ts` and
`upload-owner-probe.log`. The probe used and removed only a fresh temporary
directory; no application uploads were touched.

Current built-in upload scopes are `web-chat.upload`, `discord.upload`,
`discord.discord-chat`, `slack.upload`, and `slack.slack-chat`, each below the
runtime data directory with an `uploads` child. These stores have a default
24-hour retention window and 200-file cap, applied during pruning on save.
Their metadata/ref contains kind and ID, not package ownership. A different
physical owner encoding without migration would make existing temporary upload
references unavailable, including web-chat attachments; users might need to
upload those files again. Image entities already created from uploads embed the
bytes as data URLs and do not depend on these temporary files.

The operator's acceptance of resetting Discord/Slack thread-following state does
not authorize invalidating web-chat uploads. Confirm whether losing access to
existing temporary uploads on upgrade is acceptable before changing ownership.
No migration, fallback, file relocation, or upload implementation change has
been made in this investigation.

#### Upload owner isolation completion (uncommitted)

The operator explicitly accepted existing temporary uploads becoming unavailable
on upgrade, including web-chat attachments. Apply the correction directly, with
no migration or legacy fallback. `uploadNamespaceFor()` now validates the owner
and existing flat-path input rules, then prefixes the 64-character SHA-256 hex
digest of the JSON owner tuple with `interface-upload-`.
The fixed-length, dot-free segment stays below filesystem limits for long owners
and does not overlap the old declaration.local directories.

Both interface families pass package identity to the shared mapper. Reference
kind/ID shapes, route URLs, retention settings, and persisted state keys are
unchanged. New stores neither adopt nor prune old directories. Saved image
entities remain independent because they embed the upload bytes. No old files
were moved or deleted by this implementation.

Filesystem tests cover ordinary/ordinary, ordinary/message, message/ordinary,
and message/message owner combinations, using distinct channels where required.
They deliberately reuse an upload ID across owners and verify save/read/remove,
zero-cap pruning, legacy-file non-adoption, and restart isolation. A public SDK
test checks all four owner handles, and existing web-chat and chat integration
fixtures now use the expected owner-qualified storage directories without
changing their routing, restoration, metadata-failure, or retention assertions.
Unit checks cover every tuple component, flat-path rejection, malformed owners,
long names, and deterministic bounded output.

Evidence: `/tmp/plugin-dx-next/upload-owner-repro-tests.log` and the earlier
`upload-owner-probe.log`. Focused plugin/SDK/web-chat/chat typechecks and tests
pass in `upload-owner-targeted-final2.log`.

**Validation:** **33 public SDK tests** pass through source, built exports, and
an isolated packed consumer. Fresh forced **103/103 typecheck**, **101/101 test**
(normal concurrency), and **96/96 lint** tasks pass, together with **7/7 fresh
packed scenarios**, surface/declarations, checked examples, boot, and the complete
static/format/diff set. Logs: `upload-owner-{types,tests,lint,packed,surface,static}.log`.

This closes the known upload-directory ownership gap, following the state-owner
correction above. The remaining callback/obsolete-path inventory is still open.
No migration, publication, merge, commit, or push was performed.

Before the error tranche, validation of the two completed changes covered
**23 public SDK tests** through source, built exports, and an isolated packed
consumer. Forced repository gates
passed: **101/101 test tasks**, **103/103 typecheck tasks**, **96/96 lint tasks**,
and **7/7 freshly built packed compatibility scenarios**. Public surface and
boot checks, script typecheck, architecture, docs, workspace/dependencies,
casts, legacy inventory, test assertions, catches, changeset lanes, formatting,
and diff checks also passed.

**Initial error-mapping tranche validation (uncommitted):** the expanded **24 public SDK
tests** pass through source, built exports, and an isolated packed consumer.
Forced repository gates pass: **101/101 test tasks**, **103/103 typecheck tasks**,
**96/96 lint tasks**, and **7/7 freshly built packed compatibility scenarios**.
Surface/declaration, boot, checked documentation examples, and all script,
architecture, documentation, dependency, cast, legacy, assertion, catch,
changeset, formatting, and diff gates pass. Evidence is retained under
`/tmp/plugin-dx-next/error-*`. One initial full run timed out in the existing
agent-card expiry test; its targeted rerun and the subsequent forced full run
passed without changing that test or increasing its timeout. The SQLite test
uses the production libSQL driver rather than mixing SQLite implementations.
The dependency install also synchronized pre-existing workspace-version entries
in `bun.lock`; it did not upgrade third-party package versions.

**Job/batch continuation validation (uncommitted):** five reproduced defects are
closed: domain refusals misclassified as worker failures, unsafe/incomplete batch
errors, uncoded failed job rows with no diagnostic, malformed JSON reported as a
handler failure, and callback input reparsing. **25 public SDK tests** pass through
source, built exports, and an isolated packed consumer. Real-worker/reopened-SQLite
coverage includes declared refusal completion, batch aggregation over durable child
rows, legacy/unknown/absent errors, and prepared defaults. Native worker regressions
prove prepared-input reuse for success, thrown failure, and controlled failure.
Batch progress and directory-sync consume the shared records without losing messages.
Fresh gates pass again: **101/101 forced test tasks**, **103/103 forced typecheck
tasks**, **96/96 forced lint tasks**, **7/7 fresh packed scenarios**, surface/boot,
and the full static/format/diff gate set. Evidence is retained in
`/tmp/plugin-dx-next/job-*` and `batch-errors-repro.log`.

These changes have not been committed or pushed. They do not close the remaining
whole-surface capability audit and make no registry-publication or stable-nomination
claim.

The older statement below that inline literal responses require an annotation
is historical and superseded by the const-return regression tests. Whole-surface
acceptance remains unchecked until its own evidence is complete.

### DX guarantee corrections following review of 212ccbd541

The next external-author review reproduced six additional issues. All six are
implemented with regression coverage:

- [x] Bind tool confirmation replay to prepared input rather than parsing the
      proposal's transformed output. Keep prepared values server-side in the
      same bounded, expiring, single-use confirmation store. Cover string-to-number
      transforms, non-idempotent transforms, generated defaults, tampering,
      fabricated tokens, replay, eviction, and expiry.
- [x] Separate durable-state input/output types throughout author contexts and
      consumer wrappers. Persist validated JSON wire values and parse them at
      read boundaries. Cover defaults, transformed values, insert-if-absent,
      list/clear, invalid writes, JSON round trips, and real SQLite restart.
      Preserve JSON null rather than binding SQL NULL. Test stores use the same
      wire preparation as production; status writes no longer pre-parse values.
- [x] Preserve public harness approvals as `{ ok: false, confirmation }`,
      including the summary and replay arguments, rather than reporting refusal.
      Both service and interface tool paths execute the value actually approved.
- [x] Apply the production tool permission rule before harness handler execution.
      Cover the public/trusted/admin hierarchy, the admin default, and absence
      of side effects on denial.
- [x] Roll back all newly installed children when a compound package fails,
      including when a cleanup throws. Keep earlier packages and their bus
      subscriptions/routes usable; allow retry without resetting the harness.
- [x] Typecheck subscription handlers against response-schema input and preserve
      concrete response schemas for `request(subscription, input)`. Keep
      notifications without a response schema distinct. Negative compile tests
      still exercise runtime validation of deliberately malformed providers.

Validation for this pass:

- **21 public SDK tests** run through source, built exports, and an isolated
  packed consumer, with strict declaration checks including the negative tests.
- Forced repository checks: **101/101 test tasks**, **103/103 typecheck tasks**,
  and **96/96 lint tasks** passed.
- Freshly built packed compatibility: **7/7 scenarios** passed, including
  restart persistence, durable execution, and a site rebuild through the
  running app. Public surface/declaration checks and built boot smoke passed.
- Script typecheck, docs, workspace/dependencies, boundary casts, legacy inventory,
  test assertions, catches, changeset lanes, formatting, and diff checks passed.

These fixes address concrete inconsistencies, not a universal SDK error taxonomy.
No registry compatibility floor, stable nomination, merge, or publication is
implied by this evidence.

### Review corrections (26dcad377e)

The existing gates passed, but an external compile/runtime probe found gaps:

- [x] Narrow auth, inbox-source and attachment access in ordinary callbacks;
      registration stays runtime-owned. Check reachable callback members in a
      built-declaration consumer, not only directly exported names. Apply the
      same boundary to entity, service and interface callbacks.
- [x] Finalize every installed plugin in the public harness, in installation
      order; reset must discard every installed route. Add multi-package,
      compound-package and reset regression tests.
- [x] Reuse the schema-bearing public request contract in the testing harness;
      remove unchecked response generics and preserve coded failures.
- [x] Typecheck the SDK tests and compile the sign-off examples against built
      public declarations. Exercise entity reads/presentation, job handlers,
      stateful routes and conversational callbacks rather than only installation.
- [x] Remove the obsolete separate template/view rule and document the exact
      testing request semantics.

The built consumer found an additional transitive leak: `reconcileEntities`
accepted `EntityPluginContext`, reaching `EntityService`, `ProjectionStore` and
Drizzle declarations. The named authoring consumer no longer used it. Its SDK
export is removed, and ordinary authoring declaration checks now reject those
runtime/storage dependencies in addition to testing callback reachability.

Running the full packed matrix also found previously untested drift: a typed
job's `oncePending` function property made the erased job-reference constraint
contravariant, the health route's literal answer needed a domain return type,
the conversational golden package still used the one-object definition, and
the site CLI assertion expected an obsolete human-readable response. These are
corrected; the operator consumer explicitly loads its Node runtime types.
The job operation uses method variance, like `handle`, while runtime enqueue
continues to parse input before calling it.

Validation evidence for these corrections:

- SDK tests are included in workspace typechecking. Eight public-harness tests
  execute tools, jobs, typed reads/formatting, authenticated routes, conversational
  callbacks, multi-package/compound finalization, reset and typed request failures.
- The same tests compile and run through built public exports and an isolated
  packed consumer, including negative capability/input assertions. Their compiler
  uses the existing probes' `skipLibCheck` setting for Bun/Node test globals;
  the separate packed operator consumer still checks declarations with it off.
- Full packed compatibility: **7/7 passed**, covering restart persistence,
  durable execution, interfaces, operator surfaces and a preview rebuild requested
  through the running app.
- Final integration gates **passed**: forced typecheck (103 tasks), forced lint
  (96 tasks), repository tests (101 tasks), script typecheck, public surface
  checks and boot smoke. Static boundary/architecture/assertion gates, docs,
  core formatting, changesets, workspace/dependency and legacy checks also passed.

No legacy alpha signatures or compatibility shims were added. Earlier claims
that installation alone proved the three sign-off shapes are superseded by this
evidence. These corrections do not authorize merging, publishing, or replacing
the stable-nomination plan's exact-version and credentialed release checks.

### Corrections following the remaining acceptance audit

Implementation was authorized after the audit below. The six reproduced gaps
are now covered by regressions, not just the original happy-path tests:

- [x] Preserve validated JSON wire inputs/results across queue persistence and
      request-response boundaries. Worker bindings hold schema-validated input
      in a binding-local weak cache, without casts or output-as-input reparsing.
      Cover transforms, defaults, nullable inputs and non-JSON output contracts.
- [x] Reuse one registered-definition enqueue policy across services, both
      interface families and operators. Retain retry policy for batch children;
      refuse `oncePending` children before enqueueing because cross-root sharing
      cannot preserve batch ownership. Validate all batch wire inputs up front.
      Keep definition bindings alive until the last independent instance closes.
- [x] Share subscription validation and preserve `invalid_input` and
      `invalid_response` through the real bus. Every author context that already
      offered `messaging.request` now accepts the typed contract. Preserve raw
      handler fallback order, but return a failure code when all attempts fail;
      no-op replies are not answers, and broadcasts return no-op rather than
      claiming a missing handler. Do not log raw handler exception text. Email's
      sender lookup now consumes typed failures and logs only its derived key.
- [x] Await generic-interface setup and give both interface families cleanup
      registration. Drain all cleanup callbacks and installed plugins even when
      a release throws. The harness uses production resource scopes, rolls failed
      registration back immediately, removes partial subscriptions, and rejects
      duplicate plugin IDs without replacing a live instance. Correct tests that
      represented two brains by installing duplicate IDs into one shell.
- [x] Make the guide and all eight private golden manifests target the reviewed
      local tarball, not historical registry floors. The exact local version pin
      is not registry compatibility evidence. Registry nomination must update
      fixture pins and verify the actual published artifact. Clarify that the
      stable patch/later-minor policy starts only after stable publication.
- [x] Share exact/longest-segment-prefix HTTP matching between the running host
      and public harness. Cover query strings, trailing slashes, method mismatch,
      exact precedence, nested prefixes and segment boundaries.

Validation of this correction pass:

- **16 public SDK tests** compile and execute through source, built public
  declarations and an isolated packed consumer, including all three sign-off
  extensions and the new failure/instance/routing cases.
- **101/101 repository test tasks**, forced; **103/103 typecheck tasks**, forced;
  **96/96 lint tasks**, forced, with no failures.
- **7/7 packed compatibility scenarios** against one freshly built Brain
  tarball, including durable worker execution/restart, both interface families,
  operator composition and a preview rebuild on the running app.
- Script typecheck, surface/boot checks, documentation links/manifest, workspace
  and dependency checks, boundary-cast/legacy/assertion/catch guards, and
  changeset lane validation also pass.
- Targeted queue/adapter regressions additionally verify wire storage, parsed
  terminal callbacks and status reads, per-family policy, per-child retries and
  all-or-nothing batch input preflight. The public harness remains a
  single-attempt executor, not a retry/deadline/terminal-worker simulator.

This closes the six concrete audit findings. The unchecked whole-surface items
below still require their own evidence; this pass does not certify a universal
SDK error taxonomy, removal of every advanced capability or obsolete path, or
any registry release. No merge or publication is part of these corrections.

### Remaining acceptance audit (c1f2028e9d; historical findings)

This pass is an audit, not authorization for another implementation sweep,
merge or publication. The first review fixes remain in place. Eight SDK tests
and the built-surface, ledger and documentation suites still pass: **49 tests
across four files**. The preceding **7/7 packed matrix** is valid evidence for
its exercised paths, but does not cover the counterexamples below.

Reproductions used the current built public entries, strict external compile
probes, and focused runtime-adapter probes. The registry check downloaded the
published `alpha.313` tarball with scripts disabled; nothing was published or
credentialed. No application/runtime code changed in this audit.

#### Open findings, in implementation order

1. **Parse schema inputs once per boundary, not once per adapter.** A declared
   job accepting `{ n: z.string().transform(Number) }` rejects the valid input
   `{ n: "7" }` before its handler runs: `validateAndParse` produces a number,
   then the binding parses it again as a string. Enqueue also persists parsed
   input, which the worker validates again. Service subscription responses have
   the same problem: the provider parses the response and the typed requester
   parses its output a second time. A valid string-to-number response returns
   `invalid_response`; the equivalent generic-interface subscription succeeds.
   Sources: `shell/plugins/src/service/service-definition-contract.ts`
   (`defineJob().handle`), `service/declarative-service-plugin.ts`
   (`runtimeJobHandler`, subscriptions and enqueue),
   `shell/job-queue/src/job-queue-worker.ts`, and
   `shell/plugins/src/internal/requester.ts`.

2. **Keep declared job policies independent of the enqueueing family.** For
   the same job declaring five attempts and `oncePending`, the service enqueue
   supplies `maxRetries: 4` and its deduplication key. Generic and message
   interfaces enqueue that same job without either option. Operator enqueue
   has the same omission in source. Registration carries the deadline, but
   does not recover these missing enqueue policies. Centralize the existing
   enqueue implementation rather than making authors repeat job policy in
   every caller. Sources: `service/declarative-service-plugin.ts`,
   `interface/declarative-interface-plugin.ts`,
   `message-interface/declarative-message-interface-plugin.ts`, and
   `operator/operator-context-runtime.ts` under `shell/plugins/src/`.

3. **Unify response validation, failure codes and typed request availability.**
   A service handler returning a malformed declared response produces
   `no_handler` through the public harness, but `handler_failed` through the
   real bus. The equivalent interface produces `invalid_response` for a typed
   caller and unchecked success for a bare caller. Service setup and reaction
   contexts still expose only the one-argument untyped request method; the
   shared typed contract works in subscription callbacks but fails to compile
   in service setup. Fix this together with finding 1, using the existing
   request contract rather than another RPC API. Sources:
   `shell/plugins/src/internal/requester.ts`,
   `interface/declared-subscriptions.ts`,
   `service/service-definition-contract.ts` (`ServicePublisher`), and
   `entity/entity-definition-contract.ts` (`ReactionMessaging`).

4. **Finish setup and cleanup failure semantics.** Generic-interface async
   setup infers `Promise<State>` rather than resolved state and is not awaited
   by registration. Its setup context also has no `lifecycle.onCleanup`, despite
   the accepted shared-resource recommendation. Separately, when one service
   cleanup throws, the remaining cleanup callbacks are discarded without being
   run. This is the production declarative-service shutdown loop, not merely a
   fake. The public harness also delays rollback after failed setup until an
   explicit reset, unlike production manager rollback. Sources:
   `shell/plugins/src/interface/interface-definition-contract.ts`,
   `interface/declarative-interface-plugin.ts`,
   `service/declarative-service-plugin.ts` (`onShutdown`), and
   `shell/plugins/src/test/harness.ts` (`installPlugin`, `reset`).

5. **Make the documented install match the code being taught.** The external
   guide pins development to `@rizom/brain@0.2.0-alpha.313`, whose actual
   tarball has one-argument `defineServicePlugin` overloads and no testing
   subpath. The guide now teaches two arguments and `@rizom/brain/testing`.
   Golden package peer floors also predate their exercised breaking changes.
   Do not silently nominate an unpublished version: distinguish current-tree
   tarball instructions from historical registry evidence, then set verified
   first-containing-release floors during nomination. Sources:
   `docs/external-plugin-authoring.md` and manifests under
   `packages/brain-cli/test/fixtures/public-authoring/`.

6. **Exercise the route semantics the harness claims to model.** Public
   `harness.fetch` matches its complete path argument by exact equality.
   `/pages` works, but `/pages?q=hello` and `/pages/one` both report that nothing
   serves them even when `/pages` declares `match: "prefix"`. Reuse the
   runtime's URL/match rules and cover query strings and prefix precedence.
   Source: `packages/brain-sdk/src/testing.ts` (`fetch`).

#### Acceptance disposition

- Verified for the local candidate: exported-symbol inventory, the previously
  corrected registration readers, presentation ownership, synchronous setup
  inference and per-instance route state, the public testing entry, and the
  existing golden/packed happy paths.
- Still blocked: consistent schema transforms, typed/coded requests across
  contexts, family-independent durable-job policy, generic async resource
  setup, and failure-path cleanup. Keep the corresponding implementation
  acceptance boxes below open.
- Not claimed by this audit: complete removal of every advanced host capability,
  exact-registry compatibility of the current definitions, live provider/eval
  evidence, or stable release nomination. The historical registry version is
  explicitly not proof for this API.

### Earlier implementation record

On `work/plugin-api-boundaries`, each slice gated and committed on its own:

1. `RouteOutput` types a handler's answer from its response schema; the export
   ledger promises only what an entry point exports, and the 13 input types are
   exported. The packed external consumer is still open.
2. The three family helpers take a header and a behavior, so state is fixed
   before the behavior is checked and slot order stops mattering. 109 call
   sites migrated.
3. Service routes are built per instance after setup. Newsletter, Dashboard and
   Studio dropped the outer holders that made two instances share one client.
4. Templates and views became one declaration carrying formatter and renderer;
   `defineDataSource` took both forms and `defineEntityDataSource` is gone.
5. A failed request carries a code, so Studio stopped matching an error's
   wording. A subscription may declare its response, and a caller naming that
   contract gets a parsed answer or a named reason there is none. Entity reads
   narrow only with the schema that narrows them. The durable store is
   `runtimeState` and asking is `request`, one word per thing.
6. The entity entry stopped re-exporting general-purpose helpers, and the
   process role, git broker and entity mirror left every setup context for a
   declaration-level opt-in that directory-sync alone names.

Findings from doing the work, each recorded in its commit: the branch was
failing `surface:check` before any of this began; the ledger promised 26
unimportable names rather than the 13 the review found; a batch-generation test
had been failing three runs in ten on wall-clock ties; the fake bus answered an
unheard request as a success where the real one answers a coded failure; and
knowledge-map was reaching past the templates slot with a raw template object
that the slot then registered without its renderer.

7. The external guide's rule on entity presentation matched neither the
   contract nor the shipped packages, and says what an entity may declare now.
   The guide gained the testing entry, with an example the docs test compiles.
8. `@rizom/brain/testing` runs a package without a brain, narrowed so the
   runtime stays out of the entry whose purpose is keeping authors out of it.

Then the sign-off the plan stops on: the three shapes — an entity carrying its
own presentation with typed reads, a configured service with a durable job and
a stateful route, and a conversational interface sharing one setup resource —
are written through the public package alone, with no casts, duplicated
schemas, private imports, property-order rules, or outer state bridging setup
to a handler. Writing the second found the one gap left: the harness could
install a package that serves routes but not ask it anything, which
`harness.fetch` fixes. The two corrections the shapes forced were to the
fixtures, not to the API.

Slice 1's last step closed with them: a consumer generated from the ledger
imports every promised name from the built declarations and runs to confirm
each value exists, which the entry-source check could not see.

Withdrawn after reading the code, both dispositions written from the review
rather than the runtime:

- The contributor `bind` removal (I). `bind` seals the executor behind a
  private symbol the runtime checks, and is where the config and state types
  come from.
- The prefix-free plugin id (H). Tool listings are already prefix-free, so the
  benefit was log lines; the cost was turning a name clash between two
  authors' packages from impossible into fatal.

This plan refines the contract before the stable nomination owned by
[Public authoring API compatibility](./public-authoring-api-0.2.md). It does
not authorize merging, publishing, database migration, or a runtime rewrite.

**Goal:** an external author encounters domain schemas and behavior, not the
bookkeeping needed to make the built-in packages use the SDK. Keep the
`define*` / `use()` architecture; distinguish a successful built-in conversion
from a public contract we are willing to maintain.

**Minimization applies to the entire current authoring surface**, including
existing helpers and callback shapes, not only this branch's additions or the
abstraction candidates below. Prefer removing, combining, or extending an
existing construct before introducing another public name. Do not combine
concepts whose different authority or lifecycle is meaningful to an author.

## Review baseline

These observations describe the reviewed branch, not current `main`:

- Across entities, services, and interfaces, the ledger grows from 68 to 248
  stable symbols. Size alone is not a defect, but the additions include
  `ServiceRole`, `ServiceGitBroker`, `EntityMirror`, and Studio registration
  messages. The accepted authoring plan keeps process roles and internal
  registration channels private.
- Service and message-interface contracts document that `setup` must precede
  callbacks that destructure `state`, otherwise inference can resolve state
  to an empty object.
- Service routes receive config only; interface routes also receive state.
  Newsletter uses an outer `let state`, and Dashboard an outer `let held`, to
  bridge setup to request execution.
- The external authoring guide says entities cannot have templates, while
  `defineEntity`, blog, and doc explicitly support them.
- Comparing the ledger with SDK exports found 13 stable names absent from the
  export files. An external compile probe against the built declarations
  confirmed all 13:
  `EntityDefinitionConfig`, `EntitySeedDefinition`, `EntitySeedTrigger`,
  `OperatorCardBlock`, `OperatorViewStatus`, `WorkspaceActionFormControl`,
  `WorkspaceActionFormDefinition`, `WorkspaceActionFormFieldDefinition`,
  `WorkspaceActionFormFieldMap`, `WorkspaceActionFormOption`,
  `WorkspaceActionResultDefinition`, `WorkspaceActionResultFieldDefinition`,
  and `WorkspaceActionResultFieldMap`. The current ledger test checks that
  exports are classified, but not that every promised export exists.

Primary implementation locations on the branch:

- `packages/brain-sdk/src/{entities,services,interfaces}.ts`
- `shell/plugins/src/public/{entity,service,interface}-definition.ts`
- `shell/plugins/src/service/service-definition-contract.ts` (route slot,
  `state` store factory versus `state` setup result)
- `shell/plugins/src/interface/interface-definition-contract.ts`
  (`runtimeState`)
- `shell/plugins/src/interface/route-contract.ts` (`RouteOutput`)
- `shell/plugins/src/internal/state-namespace.ts` (persisted namespace keys)
- `shell/core/src/http-route-registry.ts` (production route collection)
- `packages/brain-cli/test/fixtures/public-authoring/export-ledger.json`
- `shell/plugins/test.ts` (the harness a public testing entry re-exports)
- `shell/plugins/src/package-definition.ts` (derived plugin ids)
- `shell/plugins/src/operator/{studio-workspace,dashboard-widget}-runtime.ts`
  (contributor binding)

## Design constraints

- A named built-in consumer proves a need, not a stable-public designation.
- Keep normal external and official extension authoring on the same contract.
  Explicitly distinguish infrastructure hosts from ordinary extensions rather
  than giving every extension a host-sized context.
- Review callback fields and transitively reachable types, not just named
  exports. Hiding a type export does not hide a capability returned by setup.
- Preserve runtime-owned authorization, ownership-scoped writes, registration,
  worker isolation, and shutdown. A smaller API must not weaken these rules.
- Prefer existing helpers and package boundaries. No generic service locator,
  universal context, new builder DSL, or speculative capability framework.
- Stable `0.2.0` has not been released. Make the intended breaking API cleanup
  now; existing alpha APIs are not a compatibility constraint. Remove superseded
  exports and signatures rather than retaining legacy aliases, overloads, shims,
  or dual authoring paths. Update built-ins, fixtures, and documentation together.
  This does not authorize destructive changes to persisted user data.
- Do not chase a target symbol count. Measure eliminated author bookkeeping,
  consistent semantics, and understandable examples instead.

## Phase 1 — Establish the contract and repair its evidence

1. Inventory the actual family exports and built declarations against the
   ledger. Record each capability's intended audience, consumers, proposed
   stability, and transitive runtime dependencies. Prior alpha publication does
   not require retaining a capability in the final `0.2.0` API.
2. Add a reverse ledger check: every stable and advanced public symbol must
   exist, with the correct type/value export. Keep intentional removals in
   their own category; do not weaken checks to accommodate missing symbols.
3. Add a generated external compile consumer importing every promised type
   and value from the packed entry points, not private workspace sources.
   Exercise runtime imports for value exports as well. **Still open**: the
   reverse check reads the entry sources, which catches a promise nobody can
   import but not a name the build fails to emit.
4. Export the 13 missing names from the family entry points in this slice.
   They are not undecided: every one is an input type of a stable helper.
   `EntityDefinitionConfig`, `EntitySeedDefinition`, and `EntitySeedTrigger`
   are the `defineEntity` input; the `Operator*` and `WorkspaceAction*` names
   are the `defineStudioWorkspace` action and view inputs, most of them already
   exported from the plugins package index. Hiding their names does not hide
   the capability, and an author who extracts a form or a seed into a named
   value needs them. There is no quarantine category: a ledger category whose
   purpose is to be emptied later is machinery built to be deleted.

**Exit:** the ledger check machinery describes what an external consumer can
actually import, not merely the source files the workspace can resolve, and
the reverse check passes with no exception list.

## Phase 2 — Explore missing abstractions before widening the API

The candidates below define the investigation scope. Findings and dispositions
are recorded after them. They are not approved API names or a commitment to
implement everything. Before implementation, turn each accepted sketch into an
external fixture and confirm it reduces author bookkeeping.

### A. Route declaration versus instance-bound execution

**Evidence:** Newsletter and Dashboard hold mutable outer state because service
route discovery is config-only. Generic and message interfaces expose state in
route callbacks already.

Config-only discovery is not a production requirement; the investigation below
closes that question. Prefer one existing route lifecycle across families, with
per-instance state and the runtime-authenticated caller, rather than a
descriptor/handler separation. Never make a manifest test start real clients,
builds, or filesystem sync just to preserve coverage.

**Proof:** one ordinary webhook service and one console use the same mechanism;
two independent runtimes instantiated from the same exported definition never
share state. Route inventories remain complete through controlled registration
or existing finalized-runtime inspection.

### B. Consuming declared contributions as a host

**Evidence:** `defineDashboardWidget` and `defineStudioWorkspace` already cover
contributors, but Dashboard and Studio consume registration messages, maintain
registries, and name runtime renderer payloads. Those host needs have expanded
the normal service exports.

Explore a narrow host-side view of registered contributions with lifecycle and
caller-scoped resolution owned by the runtime. Third-party console hosts are
not a product feature: the product is one brain with its own Dashboard and
Studio, and a plugin is justified by owning real behavior, not by reuse. The
consumer side is therefore internal. Do not build a general registry API or
replace the existing contributor helpers.

**Proof:** Dashboard and Studio no longer need internal registration-message
names on the ordinary authoring entry point. Registration rollback, removal,
optional-host behavior, and permission filtering remain covered.

### C. Definition-derived entity access and capability references

**Evidence:** jobs offer `entities.get(definition, id)` alongside string-and-schema
reads; subscription readers expose caller-selected generics; entity data sources
require a type name plus a schema. Blog's publish-assets declaration names an
image job with a qualified string.

Investigate whether the existing entity-definition and job-reference machinery
can cover these cases without duplicated schemas, unchecked generic assertions,
or hand-written runtime prefixes. Retain deliberate dynamic access for consoles
and mirrors, and avoid circular imports between an entity and its own handlers.
Do not collapse read, owned-write, routed-create, and operator-write authority
into one generic CRUD client.

**Proof:** a typed external entity reader/data source and an attachment-producing
flow can infer their contracts. Unknown references fail at registration with a
useful diagnostic; ownership and visibility checks still occur at execution.

### D. Typed requests versus one-way events

**Evidence:** subscriptions validate their input but return `unknown`; message
surfaces mix `send({ type, payload })`, `publish({ topic, data })`, and requests.
Email/notifications and site-info/newsletter provide real request/response
consumers, distinct from broadcasts.

Explore reusing an importable schema-bearing contract, as jobs already do, for
requests that need a typed response. Measure whether normalizing vocabulary is
sufficient before introducing another helper. Keep request failures distinct
from successful responses containing a domain refusal, and keep broadcasts
separate from requests with one expected answer.

**Proof:** at least two real caller/handler pairs share input/output schemas;
malformed responses and absent handlers have defined behavior. No general RPC
framework or public exposure of internal bus topics is required.

### E. Setup resources, durable state, and lifecycle capabilities

**Evidence:** service setup's `state(...)` means a durable store, while later
callbacks' `state` means the setup result; interfaces call the store factory
`runtimeState(...)`. Directory-sync's process and broker requirements also sit
on every service setup context.

Separate naming inconsistency from genuinely missing lifecycle behavior. Reuse
existing `defineDaemon`, account lifecycle, cleanup, and runtime-state scopes.
Broker/role behavior belongs behind an opt-in on the declaring definition
rather than on every service setup context; the mechanism is decided in the
investigation results below. Do not move role switches into another
universally available context property.

**Proof:** representative services and interfaces have consistent vocabulary
for in-memory state, durable bookkeeping, and cleanup. Failure during setup and
shutdown release resources; workers do not acquire scheduler-only resources.

### F. Programmatically distinguishable SDK failures

**Evidence:** added from collaborator feedback after A–E were scoped. Studio's
A2A assist path decides availability by string-matching an error message that
the messaging service composes. There is no public coded error a consumer can
check instead.

This is the one candidate whose disposition adds public surface rather than
removing or combining it. Audit existing coded errors first; reuse or
consolidate before adding a name. The minimization rule still applies: one
contract, chosen in the surface inventory, not a parallel error family.

**Proof:** Studio/A2A and one other supported boundary check a stable `code`,
and changing the human-readable message does not change caller behavior.

**Phase exit:** a disposition for every candidate, with consumers and the code
or author bookkeeping it eliminates. Reject abstractions that only rename the
same plumbing or broaden authority. Obtain API-shape agreement before large
implementation changes.

## Investigation results

### Evidence and limits

The remote branch still pointed to `ad97dc8e3` during investigation. Probes ran
outside the repository in `/tmp/brains-api-dx-investigations`, against the
isolated branch worktree. No production service, credentials, database, or API
implementation was changed.

- TypeScript 7.0.2 compiled a consumer of the built public subpaths using
  `--strict --skipLibCheck --module esnext --moduleResolution bundler`.
  Setup-first examples passed; reversing setup/state-consumer order produced
  TS2339 in services, generic interfaces, and message interfaces. No other
  diagnostics remained in that probe.
- An import-only consumer of all 248 stable names in the three families
  produced exactly the 13 missing-export diagnostics listed above.
- Five runtime characterization probes passed: definition-level state leakage,
  the real Newsletter route using a second instance's fake credentials,
  unvalidated subscription read assumptions, unvalidated subscription responses,
  and cleanup after setup failure through the production plugin manager.
  These tests assert observed behavior; passing the first four is not a claim
  that the behavior is desirable.
- A type-only prototype showed that `NoInfer` does not fix backward contextual
  inference. A two-argument header/setup-then-behavior sketch inferred state,
  including an async setup result. This proves a direction, not a complete
  replacement for the production definition signatures.
- These were focused compile/runtime probes plus source tracing, not a fresh
  packed install, full application boot, or exhaustive security review. Temporary
  probes are evidence, not permanent gates; promote the accepted cases into the
  existing suites during implementation.

### A. Routes — reuse one lifecycle, do not add another helper

**Disposition: combine existing family behavior. Priority: first consumer
migration after setup inference is decided (slice 3).**

`createRuntimeRoute` already owns authentication and request/response validation
for all families. Interface routes are built after setup and retained on the
plugin instance. Services instead call `routes({ config })` from `getWebRoutes`.
Newsletter, Dashboard, and Studio consequently retain mutable state outside the
instantiated plugin.

The reproduction instantiated the same Newsletter definition twice, configured
with `fake-A` and `fake-B`, and used a fake fetch. A route saved from the first
instance sent `Token fake-A` before the second setup and `Token fake-B` after it.
The problem is instance lifetime, not merely an awkward type annotation. The
current test helper creates a fresh definition per installation, so that path
avoids exercising reuse of the exported definition.

Config-only discovery has no production consumer. Production HTTP route
collection is `collectHttpRouteContributors` in
`shell/core/src/http-route-registry.ts`, which iterates
`pluginManager.getAllPlugins()` — registered, instantiated plugins — and runs
from `finalizeHttpRoutes()` after registration in
`shell/core/src/initialization/shellBootloader.ts`. Every other `getWebRoutes`
caller in the repository is a test or a test install helper; the concrete
early-reader is `packages/brain-cli/test/http-route-manifests.test.ts`, which
already registers interfaces but not services. The only assertion of the
requirement is the comment on the service `routes` slot in
`service-definition-contract.ts`, which justifies config-only routes by
"composition tooling [that] enumerates routes from an uninstantiated
definition". No such tooling exists in this repository.

**Recommendation (decided):** use `routes({ config, state, jobs })` after setup
for services as for interfaces, with state closures created per runtime
instance. Keep `defineRoute` and `createRuntimeRoute`; do not add
`defineRouteDescriptor`, a second registration callback, or a descriptor
registry to ordinary authoring. Delete the config-only rationale comment on the
service `routes` slot in the same change so the requirement is not re-litigated
from a stale comment. Register services in the manifest test the way it
already registers interfaces. Nothing needs stubbing on the branch: service
bring-up runs in `lifecycle.onRegistered`, which only `finalizeRegistration`
triggers, and site-builder's setup initializes its status store without
building. The manifest test's comment that registering a service would start a
filesystem sync or a build describes the class-based plugins and is deleted
with the change. Cover finalized runtime inventory as well.

Also repair the existing `RouteOutput` type: it currently yields `unknown` for
schema responses, so `{ count: "wrong" }` compiles against
`response: z.object({ count: z.number() })`. Runtime validation exists already;
its input type should be reflected statically, with schema transforms handled
correctly. This requires no new public symbol, touches only
`shell/plugins/src/interface/route-contract.ts` plus a negative compile fixture,
and does not depend on the route-lifecycle change. Land it as its own first
commit.

Sources: `shell/plugins/src/interface/route-{contract,runtime}.ts`,
`service/declarative-service-plugin.ts`,
`interface/declarative-interface-plugin.ts`, and
`plugins/newsletter/{src/index.ts,test/helpers/install.ts}`.

### B. Contribution hosts — internal consolidation, not a new extension API

**Disposition: internal only unless third-party host support is explicitly
approved.**

The contributor abstractions already exist: widgets and workspaces declare
schemas, data loaders, semantic views, and actions. Runtime adapters already
bind config/state, filter permissions, validate data, and manage cancellation.
The missing part is on the host side: Dashboard and Studio receive private bus
messages and keep registries of the callbacks those adapters produced.

**Recommendation:** preserve `defineDashboardWidget` and `defineStudioWorkspace`.
Consolidate host registration/lifecycle behind the existing runtime boundary,
not a new public `defineHost` or generic contribution system. Only expose a
bounded advanced host reader if a supported external host actually needs one.
Keep rendering in the host packages; consolidation is not a reason to move their
UI into the shell or merge widget and workspace semantics.

Sources: `shell/plugins/src/operator/{dashboard-widget,studio-workspace}-runtime.ts`,
`plugins/dashboard/src/{service,widget-registry}.ts`, and
`plugins/studio/src/{service,workspace-registry}.ts`.

### C. Entity access — combine read vocabulary, reuse schema derivation

**Disposition: extend existing readers; no new repository/client abstraction.**

`definitionEntitySchema` and `parseDefinitionEntity` already derive runtime
validation from an entity definition. `JobEntityAccess.get(definition, id)` uses
that path. Data-source and projection readers have schema-bearing overloads;
subscription readers instead permit `getEntity<T>()` without evidence for `T`.
A consumer claiming an extra numeric metadata field compiles, while a runtime
probe returns `undefined` for that field.

**Recommendation:** use one definition-/schema-backed read vocabulary across jobs,
subscriptions, data sources, and projections. Reuse a small internal structural
reader contract and the existing validators. Keep dynamic base-entity reads for
hosts. Do not add `defineRepository`, a universal CRUD API, or caller-chosen
result generics. Preserve each context's visibility ceiling and write authority.

For publish assets, ownership delegation already exists in
`service/publish-delegation-registry.ts`; the gap is the qualified job string, not
missing orchestration. Reuse definition/job references where the owner can
publish a contract without an import cycle. Entity generation jobs and service
jobs have different completion semantics, so do not force them into one generic
job executor merely to remove a string. Defer a general capability-reference
framework.

Sources: `shell/plugins/src/entity/entity-schema.ts`,
`job/{job-context-contract,job-entity-access}.ts`,
`contracts/subscription.ts`, `public/entity-data-source.ts`, and
`entities/blog/src/post-entity.ts`.

### D. Messaging — complete the existing subscription contract

**Disposition: extend/combine; no separate request/event framework.**

The bus already distinguishes first-response requests from broadcasts. What the
SDK lacks is a shared response schema and a consistently unwrapped typed answer.
Email-workflows parses both a bus envelope and the mail response; Studio does
the same for A2A assist. These are stronger consumers than a generic assertion
that subscriptions need more typing.

**Recommendation:** extend `defineSubscription` to carry the response contract
when it answers a request; let a caller reference that same contract and receive
the parsed response. Reuse the existing definition/binding pattern if separating
the importable contract from its handler is necessary. Normalize `send`/`request`
vocabulary rather than publishing both for the same operation. Keep `publish`
as the distinct broadcast operation; do not add `defineRequest`, `defineEvent`,
or public bus-envelope helpers.

Domain refusals, such as `{ kind: "unavailable" }`, remain schema-valid domain
results. Missing handlers, invalid responses, cancellation, and handler failures
need explicit transport semantics. Do not make a typed contract confer caller
authority or imply that in-process payloads such as `AbortSignal` are durable
or remotely serializable.

Sources: `plugins/email-workflows/src/source-read.ts`,
`plugins/studio/src/editor-assist.ts`,
`shell/plugins/src/{contracts/subscription,service/reaction-context}.ts`, and
`shell/messaging-service/src/message-dispatcher.ts`.

### F. Shared errors — one small public contract

**Disposition: accept as the single net-new public contract of this cleanup.**
It adds public surface where every other disposition removes or combines. That
is deliberate: consumers cannot distinguish failures programmatically today, and
no existing exported construct can be extended to carry a stable code. The
accepted addition is bounded to one schema-backed contract and, at most, one
error class implementing it; both names are chosen in the Phase 1 inventory
and enter the ledger in the same slice as their consumers.

Collaborator feedback requests a coded error instead of matching generic error
messages. This is a demonstrated need: Studio's A2A assist path
(`plugins/studio/src/editor-assist.ts`) checks whether an error starts with
`"No handler found"`, a string composed in
`shell/messaging-service/src/message-factory.ts`.

**Recommendation:** establish one schema-backed public error contract for SDK
failures that callers need to distinguish programmatically. Audit existing coded
errors first and reuse or consolidate them rather than adding parallel families.
A public error class may implement the contract for local thrown failures; its
name and export location must be chosen in the surface inventory, not as another
standalone error package.

- Define a small documented set of stable `code` values from real caller needs.
  Examples to evaluate are unavailable capability, invalid input/response, and
  cancellation; do not predeclare a taxonomy for every internal exception.
- Keep `message` human-readable and explicitly outside string-matching guarantees.
  Add structured details only when a consumer needs them, with a bounded schema.
- Preserve the code through supported HTTP and worker/job boundaries. Consumers
  must not depend solely on `instanceof`, which cannot survive serialization or
  independently loaded copies of a package.
- Keep serialization and internal-error mapping runtime-owned. Do not expose
  stacks, credentials, raw causes, or private implementation details to clients.
  External protocols retain their mandated error envelopes, using explicit
  mappings where appropriate rather than a new universal wire format.
- Keep expected domain refusals as typed results. Do not convert every unsuccessful
  domain outcome into an exception or promise to classify arbitrary third-party
  errors exhaustively.
- Replace SDK-consumer message matching with code checks. Document a safe fallback
  for unknown codes and unclassified failures.

Prove the contract with Studio/A2A and a second supported public boundary. Test
that changing the human-readable message does not change caller behavior, codes
survive serialization, unknown codes are handled safely, and sensitive internal
error data stays private. Add the intended public exports to the ledger and the
packed-consumer checks in the same slice.

### E. Resources and state — reuse lifecycle, remove infrastructure vocabulary

**Disposition: consolidate existing lifecycle/state contracts; broker integration
stays internal.**

Services already have `lifecycle.onCleanup` and `onRegistered`; daemons already
have cancellation, readiness, and bounded shutdown; account lifecycle already
exists. The production plugin manager correctly ran a cleanup registered before
setup threw. An initial direct-harness check did not: that harness bypasses the
manager's failure rollback. This is not evidence of missing production rollback.

The real consistency gaps are that service setup calls durable storage `state`,
interfaces call it `runtimeState`, generic-interface setup is synchronous-only,
and interface setup exposes no equivalent cleanup handle for a shared setup
resource. A resource used by several callbacks should not need a dummy daemon
merely to obtain a lifecycle.

**Recommendation:** standardize `runtimeState` for durable bookkeeping and `state`
for the setup result; reuse one small cleanup lifetime contract where setup
acquires resources. Preserve existing account and daemon supervision. Do not add
a general `defineResource` or public process abstraction. Do not change persisted
namespace keys as a side effect of renaming the accessor: services currently use
package namespaces, while interfaces use declaration IDs.

Directory-sync alone demonstrates a need for broker endpoint and scheduler-role
facts. **Decided mechanism:** `role`, `gitBroker`, and `entityMirror` leave
`ServiceSetupContext`. A definition opts in with one declaration-level field
whose type lives on `@rizom/brain/plugins`, the existing consumer-backed
advanced entry, and only that definition's setup context is widened with the
three fields. Directory-sync is the single consumer and stays a declared
package. `ServiceRole`, `ServiceGitBroker`, `EntityMirror`, and
`EntityMirrorClient` move from the stable services ledger to the advanced
plugins ledger with that consumer. `dataDir` stays on the ordinary context:
Studio's upload staging uses it and it carries no process authority. This does
not make trusted in-process plugins a sandbox.

Sources: `shell/plugins/src/service/service-definition-contract.ts`,
`interface/{interface-definition-contract,declarative-daemon}.ts`,
`manager/plugin-lifecycle.ts`, `internal/state-namespace.ts`, and
`plugins/directory-sync/src/service.ts`.

### G. Testing from outside the repository — publish the existing harness

**Disposition: expose existing internal helpers; no new harness.**

The fixtures under `packages/brain-cli/test/fixtures/public-authoring` contain
no test files, and the SDK has no testing entry, so an author can exercise a
plugin only by booting a packed brain. Phase 5 tests the API from the
repository side and gives authors nothing to run themselves. The built-ins
already test through `@brains/plugins/test`: `createMockShell`,
`createPluginHarness` with `expectSuccess`, `expectError`, and
`expectConfirmation`, `createMockServicePluginContext`,
`createTestJobContext` and `runServiceJob`, and the temp data-dir helpers.
Every converted package's suite proves them.

**Decided:** add `@rizom/brain/testing`, re-exporting that set unchanged, as a
stable ledger source with the same reverse and packed-consumer checks as the
families. No second harness and no fixture DSL. A helper joins the entry only
with a consumer among the sign-off tests or the built-ins, and a helper whose
signature reaches private shell, Effect, or database types stays internal
until it has a public shape. The three sign-off extensions carry unit tests
written against this entry and run from the packed package, and the fixture
README documents the pattern.

Sources: `shell/plugins/test.ts`, `shell/plugins/src/test/{harness,mock-shell}.ts`,
and `packages/brain-cli/test/fixtures/public-authoring/README.md`.

### H. Identifiers an author sees — one name per declaration

**Disposition: keep the package-scoped id. Withdrawn on the evidence.**

`shell/plugins/src/package-definition.ts` composes a plugin id as
`${packageName}:${declarationId}`, so directory-sync reads
`@brains/directory-sync:directory-sync` in logs and
`@brains/directory-sync:directory-sync:import` as a job type. This was
scheduled for removal because an author reads those ids and the prefix stutters
whenever package and declaration coincide.

Two facts, checked before the 265 references were touched, sink it.

The benefit is smaller than claimed. Tool names are already
`${declarationId}_${tool}` — `directory-sync_sync`, no package prefix — so
the MCP listing, the surface an author reads most, is short today. What the
prefix costs is log lines and job types.

The cost is larger than claimed. A package-scoped id cannot collide, because
package names are unique. A bare declaration id can: two independently authored
packages that both declare `status` compose fine now and would refuse to boot
after. The plan's own answer was a duplicate-id diagnostic, which turns a name
clash from impossible into fatal — a bad trade for a brain that composes
packages from more than one author, and the composability the single-brain
model depends on. No collisions exist in this repository today, which is what
made the change look free.

Trimming only the stutter — a bare id when the declaration is the package's
namesake — has the same failure in a narrower form, since two scopes may
publish the same short name.

**Decided:** the id keeps its package. What would make the change safe is a
registry that resolves collisions rather than refusing them, and nothing needs
one.

Sources: `shell/plugins/src/package-definition.ts`,
`shell/plugins/src/internal/state-namespace.ts`,
`shell/job-queue/src/schema/types.ts`, and
`shell/plugins/src/operator/account-settings-registry.ts`.

### I. Contributor binding — declare the loader where state exists

**Disposition: keep the bind step. The premise below was wrong.**

A Studio workspace or Dashboard widget is declared once with
`defineStudioWorkspace` or `defineDashboardWidget` and then, in the
`studioWorkspaces` or `dashboardWidgets` slot, bound with
`.bind(context, { load, actions })`.

This was scheduled for removal on the premise that the bind step exists only
because the object form cannot see `state` at declaration time. Reading the
runtime during slice 2 showed that premise is false, so the removal is
withdrawn rather than attempted. `bind` does two things the two-stage change
does not replace. It seals the executor behind a module-private symbol, and
`getStudioWorkspaceExecutor` refuses a binding that lacks it — a hand-written
object claiming to be a workspace is rejected where it would otherwise reach
the console. And it is where the config, state and account-settings types are
inferred from: without the context argument they would have to come from the
slot's contextual return type, which is where generic inference is least
reliable.

What the slot passes is not redundant bookkeeping either. The context is
`{config, state, accountSettings}`, which is what the behavior slot already
receives, and threading it into `bind` is what ties the loader's context to
this package's types.

**Decided:** keep `bind`, `OperatorBindingContext`, `BoundStudioWorkspace`
and `BoundWorkspaceAction` as they are. Removing the sealing to save one
threaded argument would trade a real guarantee for a cosmetic gain, and the
inference it provides has no better source. Nothing lands for this candidate.

Sources: `shell/plugins/src/service/service-definition-contract.ts`
(`studioWorkspaces`, `dashboardWidgets`),
`shell/plugins/src/operator/{studio-workspace,dashboard-widget}-runtime.ts`,
and `plugins/directory-sync/src/{service,lib/studio-workspace}.ts`.

## Whole-surface simplification recommendations (historical)

These are investigation recommendations, not remaining work. Subsequent
implementation and the dispositions above supersede them, including the withdrawn
H (unscoped IDs) and I (removing contributor binding) proposals.

This includes pre-existing APIs, not only the six candidates. The existing
`main` service/template entry points were also checked so inherited surface is
not mistaken for a new branch regression.

| Current surface                                                                        | Recommendation                                                                                           | Reason / boundary to retain                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service `templates` plus `views`                                                       | **Combine into one schema-bearing template declaration** with optional text formatting and web rendering | `runtimeTemplates()` already merges them by key and rejects different schema objects. One declaration removes duplicate names, schemas, generic maps, and the equality rule. Retain the JSON requirement for rendered props; do not mix this with AI prompts or markdown persistence codecs. |
| `defineDataSource` plus `defineEntityDataSource`                                       | **One authoring helper with two exclusive forms**                                                        | Both already form `AnyDataSourceDeclaration` and bind to the same data-source service. Keep the entity list/detail form's runtime pagination/navigation instead of making authors reimplement it with `fetch`. Reject ambiguous inputs; do not grow a query-builder DSL.                     |
| `getEntity`, `get(definition, id)`, and parallel reader contracts                      | **Consolidate read semantics** using definition/schema evidence                                          | Share validators and structural contracts, but retain scoped authority and a deliberate dynamic-read form.                                                                                                                                                                                   |
| Service/interface route slots                                                          | **One post-setup route lifecycle**                                                                       | Use the proven interface behavior; remove outer mutable holders and the service-only early-discovery constraint.                                                                                                                                                                             |
| `send` and `request`, plus subscription envelope parsing                               | **One typed request path**, separate from `publish`                                                      | Reuse the existing bus and subscription helper, not a second messaging system.                                                                                                                                                                                                               |
| `setup.state(...)` and `runtimeState(...)`                                             | **One name per lifetime**                                                                                | Durable state and setup-returned state are different concepts, not two spellings for one. Preserve stored keys.                                                                                                                                                                              |
| `defineProjection` and `defineProjectionRule`                                          | **Keep a simple normal path and an advanced rule path for now**                                          | Source-to-target mapping and batch/conversation reconciliation differ materially. Combining names alone would expose deletion authority and wave mechanics to the simplest example. Reuse their existing shared runtime rather than create another abstraction.                              |
| Entity/service/interface/message-interface families and package wrappers               | **Keep semantic families; do not introduce a universal `definePlugin`**                                  | Owned entities, durable work, protocol listeners, and conversations have different lifecycle/permission responsibilities. A giant union of optional slots is not a smaller conceptual API.                                                                                                   |
| Tools, durable jobs, workspace actions                                                 | **Keep distinct; share private validation/binding machinery**                                            | Agent confirmation, durable execution, and revision-bound prepared browser actions are not interchangeable operations.                                                                                                                                                                       |
| `@rizom/brain/templates` builder/registry exports and host namespace types             | **Internal or explicitly advanced after consumer audit**                                                 | Rendering a template does not require a `SiteBuilder` or a `ViewTemplateRegistry`. Removing an export alone is insufficient if it remains reachable through a callback.                                                                                                                      |
| Generic utilities on entity entry points (`pLimit`, `getErrorMessage`, string helpers) | **Remove from normal authoring unless needed for a domain contract**                                     | Their usefulness does not make them Brain authoring concepts. Use an already supported public shared library where available, ordinary dependencies, or local functions; do not create a new catch-all SDK utility subpath.                                                                  |
| Inferred public DTO/type exports                                                       | **Keep useful domain types; trim runtime-shaped aliases**                                                | Extracted handlers need names. Deleting type names while leaving the same structures implicit makes DX worse without reducing the real contract.                                                                                                                                             |
| Plugin tests: `@brains/plugins/test` only                                              | **Publish the existing harness as `@rizom/brain/testing`** (G below)                                     | An author can only exercise a plugin today by booting a packed brain. The built-ins already prove the mock shell and plugin harness; export them, do not write a second harness.                                                                                                             |
| Derived ids `${packageName}:${declarationId}` in logs, job types, tool listings        | **The plugin id is the declaration id** (H below)                                                        | Authors read these ids in logs, MCP tool listings, and job status. The package prefix is redundant for every single-definition package. No persisted user data embeds the plugin id.                                                                                                         |
| `defineStudioWorkspace` / `defineDashboardWidget` plus a setup-time `bind` step        | **Declare the loader and handlers where state exists** (I below)                                         | The bind step exists only because the object form cannot see setup state at declaration time. The two-stage pattern removes that reason.                                                                                                                                                     |

The template and data-source combinations are concrete existing-surface reduction
candidates, not instructions to widen `createTemplate` to every capability.
Start with the normal schema/formatter/renderer contract and adapt it to the
existing runtime implementation. The rich entity-template and site-section paths
must be checked against that vocabulary, not silently replaced by a host-sized
raw `Template` object.

### Setup inference decision

The order sensitivity is also present in generic interfaces, beyond the two
families whose comments mention it. It follows TypeScript's
[left-to-right contextual inference](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#improved-function-inference-in-objects-and-methods).
`NoInfer` is not a demonstrated fix.

**Decided: one shared two-stage definition pattern under the existing family
helper names**, config/setup first, behavior receiving the inferred result
second. There is no type-level correction of the object form to attempt first:
TypeScript defers every context-sensitive function in an object literal and
then infers them in property order, and `setup` and every `({ state }) =>`
callback are all context-sensitive, so no annotation on the object type lets a
later property inform an earlier one. `NoInfer` was the one candidate and it
failed. The minimal two-stage prototype compiles; slice 2 proves it against
production config schemas, account settings, templates, async setup, and
extracted handlers with the compile fixtures. Do not add an independent
setup-builder API per family. This is an API-shape change made deliberately,
not a hidden compatibility shim.

It is also the only decision in this plan that can change the shape of every
family's definition object. If the two-stage pattern wins, the contracts
migrated by later slices — routes, templates/views, data sources, readers, state
vocabulary — are all expressed in that new shape. Deciding it after those
migrations means migrating every consumer twice. Settle it first: it is a
type-level decision, the prototype already exists, and the compile fixtures it
needs are small.

### Recommended implementation order

1. ~~Land the ledger check machinery: reverse built-declaration checks and
   the 13 missing re-exports. Fix `RouteOutput` as a standalone commit in this
   slice.~~ Done, except the packed-consumer fixture (step 3 above).
2. ~~Implement the two-stage setup pattern across families.~~ Done.
3. ~~Unify service routes with the existing instance-bound lifecycle.~~ Done,
   with the Newsletter two-instance regression and the stale rationale deleted.
4. ~~Combine service templates/views and the two data-source helper names.~~
   Done, one contract change at a time, with no aliases left behind.
5. ~~Consolidate entity readers, request responses, and resource/state
   vocabulary; establish the coded-error contract.~~ Done. Two codes exist,
   because two are what a caller has to tell apart today.
6. Curate the boundary (Phase 3). Done for the utility exposure and for the
   infrastructure facts; the `@rizom/brain/templates` builder and registry
   exports still need their consumer audit.
7. Reconcile the external guide, golden examples, and presentation rule with
   the resulting API.
8. Publish `@rizom/brain/testing` (G) with its ledger source and packed-consumer
   check, and give the three sign-off extensions their unit tests.
9. ~~Make the plugin id the declaration id (H).~~ Withdrawn: see H.

No abstractions from this investigation require a new general public framework.
No design decision remains open: third-party host support is not a product
feature, so B is internal-only. Preserving legacy alpha APIs is not a
requirement.

### Landing strategy

Each numbered slice above is an independently reviewable and revertable change
against the integration branch. Slices land on `work/plugin-api-boundaries`
until that branch is on `main`; independent landing applies from then. Every
slice changes public surface, so each one carries a changeset and passes the
repository gate, not a subset of it: forced typecheck, forced lint through
`bun scripts/lint.mjs --force`, the static gates (`casts:check`,
`catches:check`, `arch:check`, `tests:assertions`, `format:check:core`,
`docs:check`, `surface:check`, `changeset:check`), and the full suite that
the pre-commit hook runs. The slices are ordered by
dependency, not preference: 1 has no dependencies, 2 gates everything after it,
and 3–5 may land in any order once 2 has landed. Slice 8 depends only on 1. Do not accumulate slices into
one long-lived branch; a slice that is not landable on its own is too large and
should be split at a contract boundary. The whole-surface table entries that are
not covered by a numbered slice are folded into slice 6.

## Phase 3 — Curate the public boundary

Use the inventory and abstraction findings to assign each capability:

1. **Normal authoring:** domain definitions and focused behavior an ordinary
   extension needs, including widgets/workspaces contributed to an existing host.
2. **Advanced integration:** a supported external use case that genuinely owns
   hosting or infrastructure behavior, backed by a standalone consumer fixture.
3. **Internal runtime:** no supported external authoring use case.

Review process roles, git broker details, entity mirrors, renderer registration
messages, and broad namespace types first. Do not automatically demote all
cross-type operations: routed creates and caller-authorized editing can be real
public needs, but their authority must remain explicit.

Decide whether the existing advanced entry point can carry approved integration
contracts before proposing a new subpath. Classification alone is insufficient:
normal entry points and inferred callback contexts should not expose internal
integration machinery as ordinary author choices.

**Exit:** every public capability has an audience and contract rationale;
infrastructure needs no longer dictate every extension's autocomplete surface.
The built-ins still work, and no class-first authoring path is reintroduced.

## Phase 4 — Make the normal path predictable

- Remove the requirement that authors order `setup` before state consumers.
  This is slice 2 of the implementation order and is decided before any
  consumer migration, not here. Start with minimal compile fixtures covering
  both property orders for services, generic interfaces, and message
  interfaces. Preserve config defaults, transforms, async setup where supported,
  and extracted handler inference. Do not fix the examples with casts,
  empty-state widening, or explicit framework generics. The shape is the
  two-stage pattern decided above.
- Implement the accepted route-binding design from Phase 2. Convert Newsletter
  and Dashboard first; extend to other service routes only after the pattern is
  proven. Keep authentication, body/response validation, and rollback semantics.
- The entity presentation rule is decided: presentation intrinsic to an entity
  lives with its definition; cross-type or independently configured
  presentation belongs in a service. This is what the entity definition
  contract, blog, and doc already do, so the code stays and the documents
  change: `docs/external-plugin-authoring.md` (the "does not have a
  `templates` field" statement) and the public-authoring fixture README's
  entity-to-template flow.
- Align the external guide, official-package guide, fixture comments, and ledger
  with that decision. Document the normal family choice, setup/resource lifetime,
  and the advanced boundary without requiring readers to study internal plans.

**Exit:** moving a property does not change inferred types; route handlers need
no mutable outer state; external examples and representative built-ins teach the
same model.

### State the compatibility promise explicitly

Align the external authoring guide, migration guidance, and release ledger with
the existing stable-nomination policy:

- **Before stable `0.2.0`:** breaking authoring changes are allowed and belong in
  this cleanup. No legacy alpha compatibility is required. Replace old forms,
  migrate consumers, and update examples; do not defer simplifications to `0.3.0`
  or add compatibility shims.
- **Starting with stable `0.2.0`:** freeze the resulting documented contract.
  Subsequent `0.2.x` patches preserve signatures and observable semantics,
  including error-code meanings. Compatible additions are allowed; message text
  may change because it is not a machine-readable contract.
- **After that freeze:** breaking authoring changes belong in `0.3.0` or a later
  minor release, with migration guidance, rather than ordinary `0.2.x` patches.
  Any security exception follows the existing release policy rather than becoming
  a general escape hatch.
- Explain which contracts are stable versus advanced alpha integrations. Do not
  imply that every exported symbol has the same stability guarantee.

This clarifies the policy already owned by the stable-nomination plan; it does
not create a separate versioning policy or authorize stable publication.

## Phase 5 — Validate the API from outside the repository

Use the existing golden packages and packed-consumer infrastructure rather than
creating a parallel test system. Add focused cases for:

- a small schema-only entity and its definition-derived reads;
- a configured service with a durable job and a stateful authenticated route;
- a message interface sharing one setup resource across listen/send;
- entity presentation following the agreed rule;
- a widget/workspace contributor without host-registration imports;
- each newly approved advanced abstraction, with its named external use case;
- each extension's own unit tests, written against `@rizom/brain/testing` and
  run from the packed package.

Include negative compile tests for wrong inputs, output types where promised,
invalid config, and unavailable capabilities. Include runtime tests for parsed
config, two-instance isolation, request validation, permissions, setup failure,
cleanup, and worker exclusion. Test against built/packed public declarations:
workspace typechecking alone cannot prove external DX.

Run targeted checks per slice, then the cross-workspace gates for the integrated
contract: typecheck, relevant tests, lint, architecture, build, and
`bun run surface:check`. Run the existing packed compatibility evidence against
the candidate artifact and `bun run docs:check` after documentation updates.
Rendered-site evidence must start a canonical test app through its existing
posture script and rebuild preview through the running app before inspecting
`dist/site-preview`; a static build alone is not sufficient.

**Investigation exit (complete):**

- [x] Every abstraction candidate has an evidence-backed disposition.
- [x] Config-only route discovery is confirmed to have no production consumer.
- [x] The setup-inference order sensitivity is reproduced in all three families.

**Implementation acceptance:**

- [x] Promised exports and packed declarations agree in both directions, with
      no exception list.
- [x] Normal authoring avoids host registries, broker details, and process roles.
- [x] Setup inference and route instance state are predictable and tested.
- [x] Presentation ownership has one documented rule used by real consumers.
- [x] Golden examples compile unchanged outside the monorepo and exercise live paths.
- [x] Public SDK failures have stable codes; consumers do not match message text,
      and supported cross-boundary mappings preserve codes without leaking internals.
- [x] Superseded alpha APIs are removed, consumers are migrated, and no legacy
      aliases, compatibility shims, or dual authoring paths remain from this cleanup.
- [x] Any advanced-contract additions are explicit.
- [x] `@rizom/brain/testing` is in the ledger and the packed-consumer check, and
      the three sign-off extensions run their own unit tests through it.
- [x] Public documentation allows breaking cleanup before stable `0.2.0` and
      states that the `0.2.x` patch promise and later-minor breaking-change policy
      apply only after the stable freeze.
- [x] The API is reviewed from the external examples, not signed off solely because
      built-in conversions and repository tests pass.

### DX sign-off and stopping rule

Before declaring the API DX-ready for v0.2, use only the candidate public package
to build three small external extensions through the existing fixture system:

1. An entity with presentation and typed reads.
2. A configured service with a durable job and an authenticated, stateful route.
3. A conversational interface sharing a setup resource across its callbacks.

All three must compile, run their own unit tests through the public testing
entry, and exercise their live paths without casts, duplicated
schemas, private imports, explicit framework generics, property-order rules, or
mutable outer state used to bridge lifecycle gaps. Setup inference has one
solution across families, the two-stage pattern; the sign-off examples prove
it rather than a documentation workaround.

When these examples and the acceptance checks pass, the public surface is
sufficiently coherent for v0.2 DX sign-off. Stop abstraction cleanup at that point;
require a concrete authoring failure or supported consumer need for further
changes, rather than pursuing elegance alone. This is not a claim that the API
will never evolve.

Completion feeds the existing stable-nomination plan; it does not replace its
exact-version, credentialed runtime, evaluation, or release-authorization gates.

## Phase 6 — Outside-author audit

**Implementation complete; local acceptance gates pass.** All eight reproduced
findings and the ninth reminders fixture are closed below. This closes the
bounded outside-author correction pass, not stable nomination or registry
acceptance. Further SDK work requires a new demonstrated authoring failure or
supported consumer need.

### How the evidence was produced

A package nobody in this repository had written before, built as the guide
instructs and nothing else: the tarball from `bun run build && bun pm pack`
in `packages/brain-cli`, the guide's `package.json` and `tsconfig.json`
verbatim (`declaration: true`, `skipLibCheck` added for bun's type package
against TS7), imports from `@rizom/brain/entities`, `@rizom/brain/services`
and `@rizom/brain/testing` only.

The package is `@example/reminders`: one entity type, and a service with
three tools (add, list due, fire), one durable job, one subscription with a
declared response, one text template and one `runtimeState` store. Four
tests through the testing entry: add-then-list, format, typed bus request,
durable fire-then-read.

Its first compile produced the errors in slices 6.2, 6.4, 6.5 and 6.6 below.
Once rewritten to what compiles today, its first run produced 6.1, 6.2 and 6.3.
Two of four tests passed before any of the findings were addressed; all four
pass with the workarounds each finding names. The reproduction below is the
minimum for each and is what the slice's test encodes.

### Slices

Each slice is one finding, test first, gated by the usual set plus
`bun run surface:check`. Order is by how much each one hides the others.

Implementation tracking (following `75c952b11a`):

- [x] 6.1 — Original test exceptions. Tool failures carry the exact thrown
      `cause`, associated by response identity outside the production wire object.
      Concurrent-call, job-cause and native-wire regressions pass.
- [x] 6.2 — Ownership guidance and actionable refusal. The golden service
      declares/writes its own type through the public packed harness; a refused
      foreign write names `entities: [...]`. The guide distinguishes ownership
      from stewardship of eligible shell types.
- [x] 6.3 — Body-only content round trips through create/update. The reproduced
      defect was in the in-memory harness: unlike production reads, it did not
      decode serialized content. It now uses the adapter's decoder while retaining
      storage-byte hashes. Cover test doubles explicitly opt into whole-file
      content; the Note assertion checks its body. This exposed real Deck/Wish
      decoder mismatches with their whole-file consumers, now corrected without
      changing stored data or encoding formats.
- [x] 6.4 — Exportable typed subscriptions and request contracts. Both types
      are in services/interfaces and both ledgers. A real packed TS4023 failure
      is fixed; the golden service exports a response-bearing subscription and
      a separately packed consumer requests it without an annotation workaround.

The 6.1–6.4 checkpoint passes forced 103/103 typecheck, 101/101 test,
96/96 lint tasks, 7/7 fresh packed scenarios, 5/5 forced surface tasks (including
boot), and the script/static/docs/format checks. The public SDK has 38 tests,
reused against the built and packed entries. This is local evidence only.

- [x] 6.5 — Consistent typed entity access in authoring callbacks. Tools, service
      jobs, subscriptions, and entity reactions share definition-typed CRUD;
      native setup/job helpers remain separate. Built-in consumers migrated
      without compatibility overloads. The checkpoint passed 103 typecheck,
      101 test, 96 lint, 7 packed scenarios, 5 surface tasks, and static gates.
      Evidence: `/tmp/plugin-dx-next/phase6-5-*` (local, not registry evidence).
- [x] 6.6 — Entity access in service routes. Route slots receive the frozen,
      definition-typed reader without write methods. The golden service route
      is exercised through packed `harness.fetch`; the durable-service app uses
      an OS-assigned HTTP port now that its fixture declares routes. Full gates
      pass: 103 typecheck, 101 test, 96 lint, 90 script tests, 7 packed scenarios,
      5 surface tasks, and static/docs/format checks.
      Evidence: `/tmp/plugin-dx-next/phase6-6-*` (local, not registry evidence).
- [x] 6.7 — Local-name harness lookup. Installed packages expose `tool(name)` and
      `job(name)`; tools/jobs retain scoped names and expose local names. Text
      templates use local names. Missing and ambiguous names fail with available
      choices; reset clears template lookup state. Runtime tool metadata supplies
      original names without suffix matching or production wire changes.
- [x] 6.8 — Author guide versus migration prose. The guide leads with the model
      and actionable API usage. Upgrade rationale, owner encodings, old state and
      upload invalidation, and old error handling moved to the migration document.
- [x] Ninth reminders fixture: owned entity, three tools, durable job, exported
      typed subscription, route, text template, and runtime state. Four tests
      compile with declaration emit and run against packed public entries, without
      private imports, casts, metadata reparsing, suffix lookup, or wrapper APIs.
      The test source is staged as `reminders.test.ts` in the installed consumer;
      it is not run against an unbuilt workspace self-import.

Final local gates: forced **103/103 typecheck**, **101/101 test**, **96/96 lint**,
**90 script tests**, **7/7 fresh packed scenarios** (including all four reminders
tests), **5/5 surface tasks** including built boot, and all static/docs/format
checks. The public SDK's 41 tests also run through the packed testing entry.
Evidence: `/tmp/plugin-dx-next/phase6-final-*`; focused local-name red/green evidence
is in `phase6-7-*`. Exact-registry coverage now inventories all nine fixtures, but
no new registry candidate was tested, published, merged, or nominated here.

#### 6.1 — The harness surfaces the author's exception

Blocking. A tool that threw answered
`{ ok: false, error: "The operation failed", code: "handler_failed" }`. The
sentence that explained it — see 6.2 — was reachable only by wrapping the
tool body in a try/catch and logging. The production sanitizer is applied
inside the testing entry, which exists so that sentence is readable.

Test: install a package whose tool throws `new Error("the real reason")`,
call it, assert the result carries the reason.

Fix: `ToolCallResult`'s failure arm gains `cause: unknown` — the thrown
value as thrown — alongside `error` and `code`. The same for
`installed.jobs[].run`, which throws a coded error today: it rethrows with
`cause` set. `error` and `code` keep their sanitized production values so
a test that asserts on them asserts what a caller would see. The guide's
testing section shows a failing assertion reading `cause`.

#### 6.2 — One family owns a type that is both stored and written

Blocking. Following the family table — `defineEntityPackage` to store a type,
`defineServicePlugin` for a tool that writes it — the tool is refused:

```text
"reminders" may only write entity types it declares, and "reminder" is not one of them
```

The path that works is `entities: [reminder]` on the service header. The
guide does not mention it; the operator fixture does it without comment.

Test: the golden service fixture's own type, declared in its header, written
from its tool through the public harness; and the refusal above, asserted to
name `entities: [...]` on the service as the fix.

Fix: the family table gains a row — a type that one package both stores and
writes belongs on that package's service header, and `defineEntityPackage`
is for a type read by others or derived by projection. The refusal names the
header slot. `stewards` is documented in the same place, since it is the
other half of the same question.

#### 6.3 — A record written through `create` reads back with its frontmatter in `content`

Blocking. A tool wrote `{ content: "Call Sam", metadata: { due, done: false } }`
through `entities.create`. Every later read — the typed `entities.get` in a
job, the untyped `listEntities` in a tool, `harness.getEntity` — returned:

```text
content: "---\ndue: '2026-09-10T05:39:19.277Z'\ndone: false\n---\nCall Sam\n"
metadata: { due: "2026-09-10T05:39:19.277Z", done: false }
```

A record seeded through `harness.addEntities` with the same fields reads back
with `content: "Call Sam"`. The write path serializes the frontmatter into
the stored content and every reader hands it back as the body.

Test: create through a tool, read through a job, assert `content` is the body
that was written. The same for `update`, which the fire job used and which
preserved the folded content.

Fix: a runtime defect in the declarative write path, found by the test. The
entity fixture's projection computes `wordCount` from `source.content`; its
golden assertion is re-derived once the body is the body.

#### 6.4 — A typed subscription can be exported

Blocking for the feature. With the guide's `declaration: true`:

```text
src/index.ts:32:14 - error TS4023: Exported variable 'dueCount' has or is using
name 'SubscriptionDefinition' from external module ... but cannot be named.
```

The guide says a `defineSubscription()` result with a response "can also be
passed directly to `request(subscription, input)`". It cannot leave the file
that declares it. `AnySubscriptionDefinition` is exported; the generic type is
not.

Test: the packed consumer exports a subscription with a response from one
fixture and calls `harness.request` with it from another.

Fix: `SubscriptionDefinition` and `RequestContract` join the services and
interfaces entries and the ledger as stable.

#### 6.5 — One entity reader for tool, job and subscription

In one service the job handler sees `entities.get(reminder, id)` with typed
metadata; the tool and the subscription see
`entities.listEntities({ entityType: "reminder" })` returning `BaseEntity`
with `metadata: unknown`, and `create(...)` returning `entityId` rather than
`id`. The tool's context type is named `EntityReactionContext`. An author
writes `reminder.metadata.parse(item.metadata)` in two of the three places.

Test: the same read and the same write written identically in a tool, a job
and a subscription handler of one fixture service, compiling and passing.

Fix: the typed reader the job already has — `get`, `list`, `search` by
definition — is what a tool and a subscription receive too, plus typed
`create(definition, input)` and `update(definition, entity)` returning
`{ id }`. `JobEntityAccess` stays where native jobs need it, off the
authoring contexts. The tool's context is named for what it is.

#### 6.6 — A service route reads entities

A route handler receives `{ request, body, caller }` and its slot
`{ config, state, jobs }`; `GET /reminders/due` cannot be written except by
closing over the setup context's `entities` through `state`, which nothing
documents.

Test: a fixture service route that lists its own type through the public
harness's `fetch`.

Fix: the routes slot receives the reader from 6.5, the same as tools. Setup
keeps its access for state that needs it.

#### 6.7 — The harness speaks local names

`installed.tools[].name` came back as `reminders_remind`; `templateNames()`
as `@fixture/package:reminders:due-list` — two scoping schemes — and
`harness.formatTemplate` needs the second. The guide says the runtime scopes
names and the author never sees that. The author ends up on
`tools.find((t) => t.name.endsWith("remind"))`.

Test: `installed.tool("remind")` and `harness.formatTemplate("due-list", …)`
by local name; both throw with the local names that exist when asked for one
that does not.

Fix: `InstalledPackage.tool(name)` and `job(name)` by local name;
`formatTemplate` takes the local name; `name` on `InstalledTool` stays the
scoped one for a test that needs it, and `localName` is added beside it.

#### 6.8 — The guide is for the author, the migration document for the upgrade

"Reader capabilities" and most of "Coded failures" describe what changed and
why — bound facades, owner encodings, fixed-length digests, which Discord and
Slack settings start fresh. An outside author reading the guide for the first
time cannot act on any of it.

Test: the docs check already exists; this slice moves prose, not code.

Fix: the change-and-why paragraphs move to `AUTHORING_0.2_MIGRATION.md`
under the release they describe. What stays in the guide is what an author
does: the reader an author gets, the codes an author branches on, how a
failure reaches a test. The guide's intro leads with the model and moves the
version caveats after it.

### What held up

The two-object definition, `runtimeState`, `defineJob().handle()`, the typed
`harness.request(dueCount, …)` answering `{ ok: true, data: { count: 1 } }`,
`installed.jobs[].run` marking a record done, and the inline literal-response
inference — `handle: () => ({ status: "ok" })` with no assertion — all worked
first time from the guide alone.

### Stopping rule for Phase 6

The package above is added as the ninth golden fixture,
`packages/brain-cli/test/fixtures/public-authoring/reminders`, with its four
tests running through the public testing entry in the packed consumer. Phase 6
is done when they pass with none of the workarounds this section names. The
rule from Phase 5 then applies again: a further change needs a further
demonstrated failure.

### Post-acceptance DX corrections

A fresh independent packed consumer demonstrated three further failures after
that acceptance: the literal guide package lacked enabled Node ambient types,
metadata conversions could be reapplied to stored output, and the HTTP test
facade discarded JSON response status/headers. The chosen correction keeps
metadata canonical rather than introducing a second storage/output contract.

- [x] Check and declaration-build the guide's actual package/compiler settings
      outside the workspace, changing only the local tarball path. Supply and enable
      Node ambient types explicitly for TypeScript 7.
- [x] Reject explicit metadata rewriting recursively at definition/registration,
      including nested pipelines, preprocessors, codecs, and overwrite checks.
      Defaults and safe coercions remain supported; input normalization stays at
      tool/job/request or import boundaries. Skill, Playbook, and Email Reply Draft
      schemas now separate those responsibilities without compatibility shims.
- [x] Validate metadata once per definition-typed parse. Exercise real SQLite
      create, reopen, read, and update using the production adapter and migrations.
- [x] Make the public harness validate before storage, matching production's
      materialization of defaults and coercions. A generated default remains stable
      across repeated reads. Correct two generation fixtures to declare the metadata
      fields their assertions depend on instead of relying on invalid writes.
- [x] Expose `fetchResponse()` for full, unconsumed HTTP responses through the
      same authentication and schema-validation pipeline. Keep `fetch()` as the
      distinct JSON-data convenience, and correct its and `templateNames()`'s docs.
- [x] Strict typechecks, repository tests, and all seven packed scenarios pass;
      the packed suite includes the isolated guide and all 44 public harness tests.

These are local corrections, not new registry or credentialed release evidence.
The stopping rule still applies; no further abstraction cleanup is implied.
