import type { AuthAuditEvent } from "@brains/auth-service";
import {
  createBuiltInStudioWorkspaceRegistration,
  defineStudioWorkspace,
  type OperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { queryInteger } from "@brains/utils/query";
import { z } from "@brains/utils/zod";
import {
  adminUserOptions,
  adminWorkspaceSource,
  formatWorkspaceDate,
  requireAuthService,
  type AdminWorkspaceSource,
} from "./workspace-format";

const actionLabels: Readonly<Record<string, string>> = {
  "auth.a2a_peer_trust.granted": "Trusted an A2A peer",
  "auth.a2a_peer_trust.revoked": "Revoked A2A peer trust",
  "auth.access.reinitialized": "Reinitialized access from configuration",
  "auth.external_peer.invited": "Invited a person from an external peer",
  "auth.external_peer.linked": "Linked an external peer",
  "auth.external_peer.unlinked": "Unlinked an external peer",
  "auth.identity.attached": "Connected an identity",
  "auth.identity.detached": "Disconnected an identity",
  "auth.identity.delivery_bound": "Bound a verified delivery channel",
  "auth.passkey.authentication_failed": "Recorded a failed passkey sign-in",
  "auth.passkey.migrated": "Migrated a passkey",
  "auth.passkey.registered": "Registered a passkey",
  "auth.passkey.registration_failed": "Recorded a failed passkey registration",
  "auth.passkey.registration_started": "Created a passkey setup link",
  "auth.passkey.revoked": "Revoked a passkey",
  "auth.setup_token.generated": "Generated a setup token",
  "auth.user.created": "Created an account",
  "auth.user.deleted": "Deleted a suspended account",
  "auth.user.grants_revoked": "Revoked account grants",
  "auth.user.role_updated": "Changed an account role",
  "auth.user.status_updated": "Changed account status",
};

function actionLabel(action: string): string {
  const known = actionLabels[action];
  if (known) return known;
  const words = action.replaceAll(/[._-]+/g, " ").trim();
  return words.length === 0
    ? action
    : `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

const auditWorkspaceQuerySchema = z.strictObject({
  actorUserId: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(200).optional(),
  selected: z.string().trim().min(1).max(120).optional(),
  offset: z
    .preprocess(queryInteger, z.number().int().min(0).max(100_000))
    .default(0),
  limit: z
    .preprocess(queryInteger, z.number().int().min(1).max(100))
    .default(25),
});

const auditEventSchema = z.strictObject({
  id: z.string().min(1),
  actorUserId: z.string().min(1).optional(),
  action: z.string().min(1),
  targetType: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative(),
});

const auditUserSchema = z.strictObject({
  userId: z.string().min(1),
  displayName: z.string().min(1),
});

const auditWorkspaceDataSchema = z.strictObject({
  query: auditWorkspaceQuerySchema,
  events: z.array(auditEventSchema),
  selectedEvent: auditEventSchema.optional(),
  users: z.array(auditUserSchema),
  actions: z.array(
    z.strictObject({
      value: z.string().min(1),
      label: z.string().min(1),
      count: z.number().int().nonnegative(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

type AuditEvent = z.output<typeof auditEventSchema>;
type AuditViewBlock = OperatorViewBlock<never>;

function eventRecord(event: AuthAuditEvent): AuditEvent {
  return {
    id: event.id,
    ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
    action: event.action,
    ...(event.targetType ? { targetType: event.targetType } : {}),
    ...(event.targetId ? { targetId: event.targetId } : {}),
    createdAt: event.createdAt,
  };
}

function actorName(
  userId: string | undefined,
  namesById: ReadonlyMap<string, string>,
): string {
  return userId ? (namesById.get(userId) ?? "Former Admin") : "System";
}

function targetName(
  event: AuditEvent,
  namesById: ReadonlyMap<string, string>,
): string {
  if (event.targetId) {
    return namesById.get(event.targetId) ?? event.targetType ?? event.targetId;
  }
  return event.targetType ?? "Access";
}

const studioAuditWorkspace = defineStudioWorkspace({
  id: "audit",
  label: "Audit",
  priority: 90,
  permission: "admin",
  query: auditWorkspaceQuerySchema,
  data: auditWorkspaceDataSchema,
  actions: [],
  view: ({ data }) => {
    const namesById = new Map(
      data.users.map((user) => [user.userId, user.displayName]),
    );
    const selected = data.selectedEvent;
    const blocks: AuditViewBlock[] = [
      {
        type: "query",
        id: "audit-query",
        controls: [
          {
            key: "actorUserId",
            label: "Actor",
            value: data.query.actorUserId,
            allLabel: "All actors",
            options: data.users.map((user) => ({
              value: user.userId,
              label: user.displayName,
            })),
          },
          {
            key: "action",
            label: "Action",
            value: data.query.action,
            allLabel: "All actions",
            options: data.actions,
          },
        ],
        pagination: {
          offset: data.query.offset,
          limit: data.query.limit,
          total: data.total,
          label: "events",
        },
      },
      {
        type: "detail",
        id: "audit-detail",
        queryKey: "selected",
        empty: "Select an event to inspect its audit record.",
        ...(selected
          ? {
              open: {
                forId: selected.id,
                title: actionLabel(selected.action),
                blocks: [
                  {
                    type: "key-values",
                    id: "audit-event-fields",
                    items: [
                      {
                        label: "Actor",
                        value: actorName(selected.actorUserId, namesById),
                      },
                      { label: "Action", value: selected.action },
                      {
                        label: "Target",
                        value: targetName(selected, namesById),
                      },
                      {
                        label: "Occurred",
                        value: formatWorkspaceDate(selected.createdAt),
                      },
                      { label: "Event ID", value: selected.id },
                    ],
                  },
                ],
              },
            }
          : {}),
        master: {
          type: "table",
          id: "audit-events",
          empty: "No audit events match these filters.",
          columns: [
            { key: "when", label: "When" },
            { key: "actor", label: "Actor" },
            { key: "action", label: "Action" },
            { key: "target", label: "Target" },
          ],
          rows: data.events.map((event) => ({
            id: event.id,
            cells: {
              when: formatWorkspaceDate(event.createdAt),
              actor: actorName(event.actorUserId, namesById),
              action: actionLabel(event.action),
              target: targetName(event, namesById),
            },
            link: { detail: { itemId: event.id } },
          })),
        },
      },
    ];
    return {
      kicker: "Security history",
      title: "Audit",
      description: "Who changed access, what changed, and when.",
      status: {
        label: `${data.total} matching ${data.total === 1 ? "event" : "events"}`,
        tone: "neutral",
      },
      blocks,
    };
  },
});

export function createAuditTabSource(
  context: ServicePluginContext,
): AdminWorkspaceSource {
  const registration = createBuiltInStudioWorkspaceRegistration({
    context,
    definition: studioAuditWorkspace,
    bind: (bindingContext) =>
      studioAuditWorkspace.bind(bindingContext, {
        load: async ({ query }) => {
          const authService = requireAuthService();
          const normalized = query.get(auditWorkspaceQuerySchema);
          const [audit, users] = await Promise.all([
            authService.queryAuditEvents({
              ...(normalized.actorUserId
                ? { actorUserId: normalized.actorUserId }
                : {}),
              ...(normalized.action ? { action: normalized.action } : {}),
              ...(normalized.selected
                ? { selectedId: normalized.selected }
                : {}),
              offset: normalized.offset,
              limit: normalized.limit,
            }),
            authService.listUsers(),
          ]);
          return {
            query: normalized,
            events: audit.events.map(eventRecord),
            ...(audit.selectedEvent
              ? { selectedEvent: eventRecord(audit.selectedEvent) }
              : {}),
            users: adminUserOptions(users),
            actions: audit.actions
              .map(({ action: value, count }) => ({
                value,
                label: actionLabel(value),
                count,
              }))
              .sort((left, right) => left.label.localeCompare(right.label)),
            total: audit.total,
          };
        },
        actions: [],
      }),
  });
  return adminWorkspaceSource(registration, studioAuditWorkspace.actions);
}
