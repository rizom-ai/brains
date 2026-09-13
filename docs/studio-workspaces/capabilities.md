# Capability-aligned Studio mockups

Status: **navigation revision awaiting review** (“update the mockups first”). The earlier workspace-content approval remains recorded, but does not approve this revised navigation or verify application fidelity. App navigation has not been changed for this revision.

## Proposed navigation

- **Overview · Chat · Library · Work · Admin · System** are the primary rail destinations, in that order.
- **Chat** opens directly, without a Work leaf column. Its session list belongs inside Chat.
- **Work** contains Inbox, Publishing, Site, and Content sync.
- **Admin** is its own primary item, separate from **System**, on desktop and in mobile Browse. It opens Administration directly, without a leaf column; People, Invitations, and Audit remain page tabs.
- **Account** opens from the top-right profile popover. It is absent from the sidebar and Browse, and does not select System or reserve a leaf column.
- Breadcrumbs read **Chat**, **Administration**, and **Account** respectively.
- Direction B collapse persists. Mobile Work and System groups remain independently collapsible. Library content, System settings, and profile utilities other than Account remain outside this eight-screen study.

Run `bun docs/studio-workspaces/preview.ts` from the repository root and open `http://127.0.0.1:8096/docs/studio-workspaces/index.html`. Each page has Desktop/Phone, Paper/Instrument and Sample state controls. Values are an illustrative snapshot, not scraped live account data. The typography and palette use the existing default Brain theme: Fraunces, Barlow and JetBrains Mono. No new typefaces or independent app palette.

## What these mockups commit to

- Preserve the approved visual hierarchy, with real provider fields and supported verbs.
- The shown sample actor is a non-Anchor Admin; permissions and protected variants are explicit below.
- All actions are local previews. No fetch, credential ceremony, publication, email or filesystem mutation occurs.
- Dialogs show action fields, scope, confirmation and result boundaries. They do not substitute for server validation or prepared-confirmation tokens.
- Declarative workspaces still use shared semantic components; these mockups do not authorize workspace-ID rendering branches.
- The main eight pages supersede the earlier illustrative content in the combined refinement study. The old combined study is not the implementation content contract.

## Screen contracts

| Screen         | Real content and actions                                                                                                                                                                                              | Alternate state / important boundary                                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview       | Attention from admitted contributions and failed recent jobs; recent entity/job activity; contribution, System and Network disclosures. Invitations open Administration.                                              | Nothing needs attention; no recent activity. No visit tracking or resumable-draft list. Counts may represent several items in one contribution row.                                                                                                                             |
| Chat           | Session titles and last activity, new conversation, archive, transcript, file attachments, send, and actual working-set context.                                                                                      | New conversation. Prototype retains drafts and never sends or uploads. Live sending supports Stop; tool/activity/job results are provider/runtime-dependent, not an invented source count.                                                                                      |
| Inbox          | Open/high/matching totals; Source and Urgency filters; source-specific facets; original-content reading pane; source-declared actions.                                                                                | No items. Selected Email source reveals a Needs reply facet. The concrete source is email-workflows: Done and confirmation-gated Dismiss. No universal Reply or Resolved tab. Source outages and unavailable/truncated original content must remain explicit in implementation. |
| Publishing     | Queued entity title/destination/position/schedule, generation jobs, failure error and recorded retry count, published total. Reorder and Remove; Retry publication.                                                   | Nothing in flight. Generating tab only when jobs exist. Reorder is within a destination, with end positions disabled. No published-history feed, global dispatch or fabricated retry allowance. Queue and prepared Publish now actions belong to entity workflows.              |
| Site           | Environment tabs, published generation and timestamp, successful render and result, failed attempt, recent builds, configured routes, automation and configured URL links. Build preview; confirmed Build production. | Not published/no routes/no builds. A failed render can coexist with a retained published generation. No thumbnail API, invented successful-page preview, or claim that a failure published a new generation.                                                                    |
| Content sync   | Recorded run source/outcome/summary/imported/exported/completed fields; current changed-file paths/status; operation issue messages/paths/timestamps; connection and repository facts. Queue Sync now.                | Healthy/no recorded runs. Maximum five retained runs; up to eight recorded issues. Changed files are a working-tree snapshot, not a chronological document feed. No Compare versions, conflict resolver or overwrite-safety promise.                                            |
| Administration | People, person protections, role/access, passkeys, channels and external relationships; invitations pending/history and delivery state; audit actor/action/event details.                                             | No invitations/audit. Forms use configured channel types/modes. Prepared role/access changes and protected Anchor/self/final-passkey cases cannot be bypassed. Manual setup-link results are sensitive; no real link is generated here.                                         |
| Account        | Profile, read-only connected channels, schema-driven plugin settings, passkey enrollment/revocation, current/other sessions and scoped sign-out actions.                                                              | Anchor-managed name and final-passkey protection. Revoke omitted for final passkey; End other sessions disabled when none exist. Settings omitted when none are supplied. No independent Anchor-name override.                                                                  |

## Permission contract

- Overview: signed-in access, with each contribution separately admitted.
- Chat and Account: authenticated actor and host admission; no guest-chat controls are implied.
- Inbox: host/provider admission, then each source/action's permission and capability checks.
- Publishing and Site: Trusted or Admin. Site production build is Admin-only with confirmation.
- Content sync and Administration: Admin-only.
- Hidden or denied workspaces/actions must not be presented as available to a lower-permission actor. These pages deliberately show the Admin sample rather than pretending to exercise a real auth session.

## Source of truth inspected

Paths are relative to the repository root.

- `plugins/studio/src/overview-workspace.ts`
- `plugins/admin/src/invitations-overview.ts`
- `plugins/studio/ui-react/src/studio-chat-workspace.tsx`
- `plugins/unified-inbox/src/operator-studio.ts`
- `plugins/email-workflows/src/inbox-source.ts`
- `plugins/content-pipeline/src/lib/studio-workspace.ts`
- `plugins/site-builder/src/lib/site-workspace.ts`
- `plugins/directory-sync/src/lib/studio-workspace.ts`
- `plugins/directory-sync/src/lib/directory-sync-operation-status.ts`
- `plugins/admin/src/administration-workspace.ts`
- `plugins/admin/src/people-workspace.ts`
- `plugins/admin/src/invitations-workspace.ts`
- `plugins/admin/src/peer-tab-provider.ts`
- `plugins/admin/src/audit-workspace.ts`
- `plugins/studio/ui-react/src/account/account-view.tsx`

## Review boundary

Additional selectable states cover Sync’s five retained failed runs and eight issues, a Site build in progress, Chat’s Stop control during a response, and an unavailable Inbox source. These are deliberately included to expose real data density rather than designing only the quiet case.

The layout may regroup existing fields and use clearer labels; it must not add backend capabilities. Where the current renderer cannot express an approved grouping, use a validated generic semantic presentation contract—not a plugin-specific component. Dense diagnostics, large collections, mobile reading, in-flight activity and action results need verification during implementation as well as the samples here.
