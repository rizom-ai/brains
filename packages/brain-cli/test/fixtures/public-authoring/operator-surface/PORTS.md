# Phase 1 built-in port sketches

These sketches test the accepted public contract vocabulary against the four
built-in Studio workspaces named by the plan. They preserve domain operations, permission
rules, and action semantics; they do not attempt to preserve bespoke markup.
Identifiers such as `state.snapshot()` stand for package-owned domain state
returned by `setup()`.

None of these snippets is a runtime-complete shipped API. They intentionally
use the same module-scope-contract/factory-bound-executor split as `src/index.ts`.

## Shared semantic view vocabulary

The golden package and ports require this initial host-rendered vocabulary:

- `stats`: labeled values with optional `good`, `warn`, or `neutral` tone;
- `key-values`: compact operational facts;
- `notice`: bounded informational, warning, or error copy;
- `list`: ordered records with stable row IDs;
- `table`: declared columns, stable row IDs, optional filters, links, and typed
  row actions;
- `links`: validated external links plus runtime-owned entity links within Studio;
- typed action controls: definition reference plus schema-valid input; and
- deterministic empty text on list/table blocks.

A table filter is declarative local presentation over already validated data;
it is not a workspace action and does not reach the server. Account-setting
forms are separate host-owned forms derived from settings schema/field metadata,
not arbitrary `OperatorView` forms.

## Directory Sync

**Verdict:** expressible without a custom renderer. The visual flow diagram and
coverage bars reduce to stats, key-values, notices, and lists without losing an
operation.

```ts
const syncNow = defineWorkspaceAction({
  name: "sync-now",
  label: "Sync now",
  permission: "admin",
  input: z.object({}),
  output: syncRequestResult,
});

const directorySyncWorkspace = defineStudioWorkspace({
  id: "sync",
  label: "Sync",
  priority: 60,
  permission: "admin",
  data: directorySyncSnapshot,
  actions: [syncNow],
  view: ({ data }) => ({
    title: "Content sync",
    blocks: [
      {
        type: "stats",
        items: [
          { label: "Files", value: data.directory.totalFiles },
          {
            label: "Entity types",
            value: Object.keys(data.directory.byEntityType).length,
          },
          { label: "Branch", value: data.git?.branch ?? "local" },
          {
            label: "Issues",
            value: data.issues.length,
            tone: data.issues.length > 0 ? "warn" : "good",
          },
        ],
      },
      {
        type: "action",
        action: syncNow,
        input: {},
        disabled: data.activeRun !== undefined,
      },
      {
        type: "list",
        id: "recent-syncs",
        empty: "No completed sync activity recorded in this runtime.",
        items: data.recentRuns.map((run) => ({
          id: run.id,
          title: run.summary,
          description: `${run.imported} imported · ${run.exported} exported`,
          meta: run.completedAt,
          tone: run.outcome === "succeeded" ? "good" : "warn",
        })),
      },
      ...data.issues.map((issue) => ({
        type: "notice",
        id: issue.id,
        tone: "warn",
        title: issue.kind,
        text: issue.message,
      })),
    ],
  }),
});

studioWorkspaces: (context) => {
  const syncNowHandler = syncNow.bind(context, ({ state, caller, signal }) =>
    state.requestSync({ caller, source: "studio", signal }),
  );
  return [
    directorySyncWorkspace.bind(context, {
      actions: [syncNowHandler],
      load: ({ state, signal }) => state.snapshot(signal),
    }),
  ];
};
```

This port requires operator loaders/actions to receive parsed service `state`
and `config`; the original plan implied that relationship but did not list it
in the public callback context.

## Site

**Verdict:** expressible after adding one narrow policy query and semantic entity
links. Static host-owned confirmation is sufficient for the live-build action.

```ts
const buildPreview = defineWorkspaceAction({
  name: "build-preview",
  label: "Build preview",
  permission: "trusted",
  input: z.object({}),
  output: buildRequestResult,
});

const buildProduction = defineWorkspaceAction({
  name: "build-production",
  label: "Update live site",
  permission: "admin",
  confirmation:
    "Replace the current live output with published public content?",
  input: z.object({}),
  output: buildRequestResult,
});

const siteWorkspace = defineStudioWorkspace({
  id: "site",
  label: "Site",
  priority: 50,
  permission: "trusted",
  entities: [siteInfo],
  data: siteSnapshot,
  actions: [buildPreview, buildProduction],
  view: ({ data }) => ({
    title: "Site control",
    blocks: [
      {
        type: "stats",
        items: data.environments.map((environment) => ({
          label: environment.environment,
          value:
            environment.active?.state ??
            (environment.lastFailure ? "failed" : "current"),
          tone: environment.lastFailure ? "warn" : "good",
        })),
      },
      {
        type: "actions",
        items: [
          { action: buildPreview, input: {} },
          { action: buildProduction, input: {} },
        ],
      },
      {
        type: "list",
        id: "recent-builds",
        empty: "No completed builds in this runtime.",
        items: data.recentBuilds,
      },
      {
        type: "links",
        items: [
          { label: "Open preview", target: { external: data.site.previewUrl } },
          { label: "Open live", target: { external: data.site.liveUrl } },
          {
            label: "Edit site metadata",
            target: { entity: siteInfo, id: "site-info" },
          },
        ],
      },
    ],
  }),
});

studioWorkspaces: (context) => {
  const previewHandler = buildPreview.bind(context, ({ state }) =>
    state.requestBuild("preview"),
  );
  const productionHandler = buildProduction.bind(context, ({ state }) =>
    state.requestBuild("production"),
  );
  return [
    siteWorkspace.bind(context, {
      actions: [previewHandler, productionHandler],
      authorize: ({ permissions }) => permissions.allows(siteInfo, "update"),
      load: ({ state, signal }) => state.snapshot(signal),
    }),
  ];
};
```

The missing policy query must answer only whether the canonical caller may
perform an action on a referenced entity definition. It must not expose the
permission service or allow elevation. External links remain protocol-checked;
entity links are resolved by the Studio host.

## Email Triage

**Verdict:** expressible with table filters and conditional typed row actions.
The package's existing domain state continues to own restricted status
transitions; the operator contract does not need a general entity-write escape
hatch for this port.

```ts
const markReviewed = defineWorkspaceAction({
  name: "mark-reviewed",
  label: "Mark reviewed",
  permission: "admin",
  input: z.object({ id: z.string() }),
  output: statusActionResult,
});

const markHandled = defineWorkspaceAction({
  name: "mark-handled",
  label: "Mark handled",
  permission: "admin",
  input: z.object({ id: z.string() }),
  output: statusActionResult,
});

const archive = defineWorkspaceAction({
  name: "archive",
  label: "Archive",
  permission: "admin",
  input: z.object({ id: z.string() }),
  output: statusActionResult,
});

const emailWorkflowsWorkspace = defineStudioWorkspace({
  id: "email-workflows",
  label: "Email Triage",
  priority: 30,
  permission: "admin",
  entities: [mailItem],
  data: mailTriageSnapshot,
  actions: [markReviewed, markHandled, archive],
  badge: ({ data }) => data.summary.new,
  view: ({ data }) => ({
    title: "Mail desk",
    blocks: [
      {
        type: "stats",
        items: [
          { label: "New", value: data.summary.new },
          { label: "High priority", value: data.summary.high },
          { label: "Needs reply", value: data.summary.needsReply },
          { label: "Unclassified", value: data.summary.unclassified },
        ],
      },
      {
        type: "table",
        id: "mail",
        filters: [
          { key: "category", label: "Category", values: mailCategories },
          { key: "priority", label: "Priority", values: mailPriorities },
          { key: "status", label: "Status", values: mailStatuses },
          { key: "needsReply", label: "Needs reply", values: yesNo },
        ],
        columns: mailColumns,
        rows: data.items.map((item) => ({
          id: item.id,
          cells: item,
          actions: [
            ...(item.status === "new"
              ? [{ action: markReviewed, input: { id: item.id } }]
              : []),
            ...(item.status === "new" || item.status === "reviewed"
              ? [{ action: markHandled, input: { id: item.id } }]
              : []),
            ...(item.status !== "archived"
              ? [{ action: archive, input: { id: item.id } }]
              : []),
          ],
        })),
      },
    ],
  }),
});

studioWorkspaces: (context) => {
  const reviewedHandler = markReviewed.bind(
    context,
    ({ input, state, caller }) => state.markReviewed(input.id, caller),
  );
  const handledHandler = markHandled.bind(context, ({ input, state, caller }) =>
    state.markHandled(input.id, caller),
  );
  const archiveHandler = archive.bind(context, ({ input, state, caller }) =>
    state.archive(input.id, caller),
  );
  return [
    emailWorkflowsWorkspace.bind(context, {
      actions: [reviewedHandler, handledHandler, archiveHandler],
      load: ({ state, signal }) => state.snapshot(signal),
    }),
  ];
};
```

Filter declarations may select only fields already present in validated data.
The host derives controls from declared scalar filter values and never accepts
an author component or script.

## Publishing

**Verdict:** the summary, queue, generating list, failures, reorder/remove/retry
controls, and static table rendering fit `OperatorView`; the complete workspace
does **not** fit the first generic contract.

Exact missing capabilities:

1. Entity coverage is discovered at runtime from publish-provider
   registrations, not a static list of imported entity definitions.
2. Queue rows link to Studio editors for those runtime-discovered entity types, so
   a compile-time entity-definition reference is unavailable.
3. “Publish now” uses a provider-prepared, content-hash-bound confirmation with
   a dynamic preview and expiry. Static action confirmation cannot preserve its
   replay and stale-content protections.
4. Queue ordering is scoped per destination and maps caller-filtered view
   positions back to absolute queue positions.

Do not widen the initial public contract with a dynamic capability registry or
an open confirmation protocol solely for this built-in. Keep the specialized
Publishing renderer and action adapter private. Its Dashboard summary can move
to the generic widget path independently because that surface needs only
validated stats, digest, and attention.

## Account-settings ownership finding

The golden service can prove principal-scoped settings and operator injection,
but the plan's stated IMAP case is owned today by the Email **message
interface**, not by a service plugin. Moving mailbox intake into a service would
violate the connected-channel ownership decision.

Phase 0 accepted the architectural choice:

- `defineAccountSettings()` is a shared definition exported
  from both `@rizom/brain/services` and `@rizom/brain/interfaces`.
  `accountSettings` may be attached to service, generic-interface, and
  message-interface definitions. Dashboard/workspace callbacks receive only
  the current caller's parsed settings; a supervised interface/message daemon
  may bind with `forAccounts`, causing the runtime to own one task per
  configured principal and replace/cancel it when mailbox credentials change or
  are removed.
- **Rejected workaround:** move IMAP polling into a service just so it can use a
  service-only settings contract.

The principal-owned form belongs under Account, not Studio. Studio must not display or
administer another principal's secret. A secret marker gives
the host encrypted-at-rest and write-only display behavior; callbacks remain a
trusted package boundary, so the framework can prevent automatic serialization
and logging but cannot stop intentionally malicious package code from revealing
a plaintext secret it is authorized to consume.
