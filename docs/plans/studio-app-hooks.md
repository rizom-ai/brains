# Plan: Studio App hooks

## Status

**Active.** Slice 1 (`useStudioData`) has landed; slice 2 is next.

## Goal

`plugins/studio/ui-react/src/App.tsx` is one 1307-line component at cyclomatic complexity 63: nine state hooks, seven refs, six effects, nineteen callbacks, eight queries and three mutations, then the render. The view side was split in September 2026 (`deriveStudioAppModel`, the three panes); this plan does the same for the container so each concern is a hook with its own inputs, outputs and tests, and `App` becomes composition plus render selection.

No behaviour changes. Every slice must leave `app.test.tsx`, `app-transport.test.tsx` and `studio-navigation.test.tsx` passing unchanged, and adds hook-level tests for the logic it moves.

## Current baseline

| Concern               | Where it lives today                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route reading         | `routeTarget`, `createMode`, `currentStudioPathname` memos                                                                                                                                                               |
| Data                  | eight `useQuery` calls and three `useMutation` calls with derived values                                                                                                                                                 |
| Route resolution      | the effect that maps `routeTarget` to `activeWorkspaceId`, `entityType` and `loadError`, with alias and home redirects                                                                                                   |
| Open requests         | `openRequestId`, `pendingOpenState`, `selectedEntityTypeRef`, `loadAttempt`, the open effect, `openEntity`, `retryRead`                                                                                                  |
| Editor actions        | `runFieldAssist`, `applyFieldAssist`, `save`, `remove`, `baselineCommit`, `saveStartedAt`, the post-save polling effect                                                                                                  |
| Navigation actions    | `selectEntityType`, `changeEntityPage`, `selectWorkspace`, `selectFolder`, `startCreate`, `backToList`, `openWorkspaceEntity`, `openWorkspaceLaunch`, `captureInboxAsNote`, `discussInboxInChat`, `changeWorkspaceQuery` |
| Route effects         | pagination clamp, workspace URL canonicalisation, declarative refresh timer                                                                                                                                              |
| Blockers and branches | navigation blocker, chat draft store, account and chat workspace branches, status screens                                                                                                                                |

Tests: `app.test.tsx` (2091 lines) drives the whole container through a memory router; `app-transport.test.tsx` (1245) covers the API layer; `studio-navigation.test.tsx` (653) covers rail and route behaviour.

## Non-goals

- No change to what the studio renders or when. Snapshots and existing assertions stay as they are.
- No context provider. Hooks take explicit inputs and return explicit outputs so the data flow stays visible in `App`.
- `studio-chat-workspace.tsx`, the account app and the editor reducer are out of scope.

## Architecture decisions

1. **One hook per concern, composed in `App`.** `useStudioData`, `useStudioNavigationActions`, `useEntityOpener`, `useEditorActions`, `useStudioRouteEffects`. Each lives in its own file next to `App.tsx` and exports its input and output types.
2. **Open requests become a reducer.** The request id, pending open state and load attempt are one `openRequestReducer` with actions `requested`, `superseded`, `retried`, `pendingConsumed`. The effect and `openEntity` read the current id from state instead of a ref, so "a stale fetch never dispatches" is a reducer property with a test, not a convention.
3. **Refs that only bridge callbacks stay refs.** `selectedEntityTypeRef`, `preferredMobilePane` and `saveStartedAt` carry values across async boundaries without re-rendering; they move with the hook that owns them.
4. **Inputs are values, not the whole props bag.** A hook receives what it reads (for example `entityType`, `entityCollectionQuery`, `router.history`), so its tests construct only that.
5. **Behaviour-preserving slices, one PR each.** Each slice moves code verbatim where it can, adds the hook's tests first, and runs the full studio suite before merge.

## Slices

Each slice is one PR. Tests are written before the hook.

1. **`useStudioData`.** The eight queries and three mutations, taking `api`, `entityType`, the active entity id, capabilities, the collection query, the workspace request and the create-destination input. Returns the same names `App` uses today. Tests: query enablement follows the inputs (no entity type means no entity queries; destination only for a named create).
2. **`useStudioNavigationActions`.** The eleven route-pushing callbacks with `router.history`, `studioBasePath`, `entityType`, `entityCollectionQuery`, `workspaces`, `schema`, capabilities and `routeSearch` as inputs; `changeWorkspaceQuery` keeps its state setter as an input. Tests: each action pushes or replaces the expected href and history state against a memory history.
3. **`useEntityOpener`.** The open-request reducer, the open effect, `openEntity` and `retry`. Inputs: route values, `entityType`, `createMode`, capabilities, the query client, the editor dispatch and the mobile-pane setters. Tests: superseded requests do not dispatch; a pending open state is consumed exactly once for its pathname; retry re-runs only from browse mode.
4. **`useEditorActions`.** `runFieldAssist`, `applyFieldAssist`, `save`, `remove`, the baseline commit and the post-save polling effect. Inputs: the data hook's mutations, the opener's `openEntity` and current request id, editor state and dispatch. Tests: save invalidates the right keys and reopens; a stale request's save result is ignored; delete replaces the route without the blocker.
5. **`useStudioRouteEffects`.** Pagination clamp, workspace URL canonicalisation and the declarative refresh timer, plus the route-resolution effect that sets the active workspace and entity type. Tests: an out-of-range offset is clamped; a workspace with `urlQuery` gets its canonical search; unknown routes surface a load error.
6. **Compose.** `App` keeps route reading, the blocker, the chat and account branches and render selection. Target is under 400 lines with no function over complexity 20 in `plugins/studio/ui-react/src`.

## Validation

- Per slice: `turbo run test --filter @brains/studio`, `turbo run typecheck --filter @brains/studio`, `bun scripts/lint.mjs --force --filter @brains/studio`, both format lanes, `bun run changeset:check`.
- After slice 6: no function in `App.tsx` exceeds 200 lines or cyclomatic complexity 20, checked with any complexity reporter over the TypeScript AST.

## Risks and mitigations

- **Hidden coupling through refs.** The open effect and `save` both read `openRequestId`. Slice 3 makes that state explicit before slice 4 moves `save`, so the dependency is a value passed between hooks.
- **Effect order.** Route resolution runs before the open effect today because of declaration order. Slice 5 keeps the resolution effect inside the same hook as the values it sets, and `App` calls that hook before the opener.
- **Test harness drift.** `app.test.tsx` renders the real `App`; if a slice needs a test seam, it adds a hook test rather than a prop on `App`.

## Success criteria

- `App.tsx` under 400 lines, composed of named hooks with typed inputs and outputs.
- Every moved concern has hook-level tests that fail without the behaviour they name.
- The studio suite passes unchanged after each slice.

## Related plans

- [studio-ux-improvements.md](./studio-ux-improvements.md) owns the remaining presentation decisions this plan must not pre-empt.
- [studio-hierarchical-entity-navigation.md](./studio-hierarchical-entity-navigation.md) shipped the folder routes these hooks carry.
