import type { AuthService } from "@brains/auth-service";
import {
  createBuiltInStudioWorkspaceRegistration,
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorView,
  type OperatorViewBlock,
  type RuntimeStudioOperatorBlock,
  type RuntimeStudioOperatorColumnsBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorRegionBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { queryInteger } from "@brains/utils/query";
import { z } from "@brains/utils/zod";
import { randomUUID } from "node:crypto";
import {
  adminWorkspaceSource,
  formatWorkspaceDate,
  requireAuthService,
  type AdminWorkspaceSource,
} from "./workspace-format";

const TERMINAL_INVITATION_STATES = new Set(["claimed", "expired", "cancelled"]);

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function invitationTone(state: string): "good" | "warn" | "neutral" | "error" {
  switch (state) {
    case "claimed":
    case "sent":
      return "good";
    case "failed":
      return "error";
    case "expired":
    case "cancelled":
      return "warn";
    default:
      return "neutral";
  }
}

const invitationQuerySchema = z.strictObject({
  state: z.enum(["pending", "history"]).optional().default("pending"),
  offset: z
    .preprocess(queryInteger, z.number().int().min(0))
    .optional()
    .default(0),
  limit: z
    .preprocess(queryInteger, z.number().int().min(1).max(100))
    .optional()
    .default(25),
});

const setupResultSchema = z.strictObject({
  status: z.string(),
  setupUrl: z.url().nullable(),
  expiresAt: z.string().nullable(),
});

const createInvitationInputSchema = z.strictObject({
  idempotencyKey: z.string().min(1),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "trusted"]),
  deliveryType: z.string().trim().min(1).max(100),
  deliverySubject: z.string().trim().min(1).max(500),
  deliveryLabel: z.string().trim().max(200).optional(),
  deliveryMode: z.enum(["automatic", "manual"]),
});

const invitationIdInputSchema = z.strictObject({
  invitationId: z.string().min(1),
});

const manualConfirmationInputSchema = z.strictObject({
  invitationId: z.string().min(1),
  deliveryAttemptId: z.string().min(1),
});

const invitationMutationResultSchema = z.strictObject({
  invitationId: z.string(),
  state: z.string(),
});

const createInvitation = defineWorkspaceAction({
  name: "create-invitation",
  label: "Add a person",
  permission: "admin",
  input: createInvitationInputSchema,
  output: setupResultSchema,
});

const resendInvitation = defineWorkspaceAction({
  name: "resend-invitation",
  label: "Resend",
  permission: "admin",
  catalog: true,
  confirmation: {
    kind: "static",
    message: "Create a new single-use setup link for this invitation?",
  },
  input: invitationIdInputSchema,
  output: setupResultSchema,
});

const cancelInvitation = defineWorkspaceAction({
  name: "cancel-invitation",
  label: "Cancel",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: invitationIdInputSchema,
  output: invitationMutationResultSchema,
});

const confirmManualDelivery = defineWorkspaceAction({
  name: "confirm-manual-delivery",
  label: "Confirm delivered",
  permission: "admin",
  input: manualConfirmationInputSchema,
  output: invitationMutationResultSchema,
});

const invitationChannelSchema = z.strictObject({
  type: z.string(),
  displayName: z.string(),
  subjectLabel: z.string(),
  deliveryModes: z.array(z.enum(["automatic", "manual"])),
});

const invitationRowSchema = z.strictObject({
  id: z.string(),
  displayName: z.string(),
  role: z.string(),
  state: z.string(),
  destination: z.string(),
  updatedAt: z.number(),
  deliveryAttemptId: z.string().optional(),
});

const invitationsDataSchema = z.strictObject({
  query: invitationQuerySchema,
  idempotencyKey: z.string(),
  channels: z.array(invitationChannelSchema),
  invitations: z.array(invitationRowSchema),
  selectedTotal: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  historyCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
});

type InvitationAction =
  | typeof createInvitation
  | typeof resendInvitation
  | typeof cancelInvitation
  | typeof confirmManualDelivery;
type InvitationBlock = OperatorViewBlock<InvitationAction>;
type InvitationPrimaryAction = NonNullable<
  OperatorView<typeof createInvitation>["primaryAction"]
>;
type InvitationTotalsBlock = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "stats" }
>;

function requiredInvitationBlock(
  blocks: readonly RuntimeStudioOperatorBlock[],
  id: string,
): RuntimeStudioOperatorBlock {
  const matches = blocks.filter((block) => block.id === id);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(
      `Invitations tab composition requires block "${id}" exactly once`,
    );
  }
  return matches[0];
}

function requiredInvitationRegion(
  blocks: readonly RuntimeStudioOperatorBlock[],
  id: string,
): RuntimeStudioOperatorRegionBlock {
  const block = requiredInvitationBlock(blocks, id);
  switch (block.type) {
    case "tabs":
    case "detail":
    case "columns":
      throw new Error(
        `Invitations tab composition block "${id}" must be a region`,
      );
    default:
      return block;
  }
}

export function composeInvitationTabSections(
  blocks: readonly RuntimeStudioOperatorBlock[],
  peerAside: readonly RuntimeStudioOperatorRegionBlock[],
): {
  readonly totals: InvitationTotalsBlock;
  readonly blocks: readonly RuntimeStudioOperatorColumnsBlock[];
} {
  const totals = requiredInvitationBlock(blocks, "invitation-totals");
  if (totals.type !== "stats") {
    throw new Error(
      'Invitations tab composition block "invitation-totals" must be stats',
    );
  }
  const unavailable = blocks.some(
    (block) => block.id === "create-invitation-unavailable",
  )
    ? [requiredInvitationRegion(blocks, "create-invitation-unavailable")]
    : [];
  return {
    totals,
    blocks: [
      {
        type: "columns",
        id: "invitation-layout",
        primary: [requiredInvitationRegion(blocks, "invitations")],
        aside: [...unavailable, ...peerAside],
      },
    ],
  };
}

const setupResultPresentation = {
  title: "Invitation setup",
  fields: {
    status: { label: "Status" },
    setupUrl: {
      label: "Single-use setup URL",
      copyable: true,
      sensitive: true,
    },
    expiresAt: { label: "Expires" },
  },
};

const studioInvitationsWorkspace = defineStudioWorkspace({
  id: "invitations",
  label: "Invitations",
  priority: 11,
  permission: "admin",
  query: invitationQuerySchema,
  data: invitationsDataSchema,
  actions: [
    createInvitation,
    resendInvitation,
    cancelInvitation,
    confirmManualDelivery,
  ],
  badge: ({ data }) => data.pendingCount,
  view: ({ data }) => {
    const blocks: InvitationBlock[] = [
      {
        type: "stats",
        id: "invitation-totals",
        items: [
          { label: "Pending", value: data.pendingCount },
          { label: "History", value: data.historyCount },
          {
            label: "Delivery failures",
            value: data.failureCount,
            tone: data.failureCount > 0 ? "warn" : "neutral",
          },
        ],
      },
    ];
    const deliveryModes = Array.from(
      new Set(data.channels.flatMap((channel) => channel.deliveryModes)),
    );
    let primaryAction: InvitationPrimaryAction | undefined;
    if (data.channels.length > 0 && deliveryModes.length > 0) {
      primaryAction = {
        action: createInvitation,
        input: { idempotencyKey: data.idempotencyKey },
        form: {
          presentation: "disclosure",
          submitLabel: "Create invitation",
          fields: {
            displayName: { label: "Display name", control: "text" },
            role: {
              label: "Role",
              control: "select",
              options: [
                { value: "trusted", label: "Trusted" },
                { value: "admin", label: "Admin" },
              ],
            },
            deliveryType: {
              label: "Delivery channel",
              control: "select",
              options: data.channels.map((channel) => ({
                value: channel.type,
                label: channel.displayName,
              })),
            },
            deliverySubject: {
              label: "Delivery destination",
              labelBy: {
                field: "deliveryType",
                values: data.channels.map((channel) => ({
                  value: channel.type,
                  label: channel.subjectLabel,
                })),
              },
              control: "text",
            },
            deliveryLabel: {
              label: "Delivery label (optional)",
              control: "text",
            },
            deliveryMode: {
              label: "Delivery mode",
              control: "select",
              options: deliveryModes.map((mode) => ({
                value: mode,
                label: mode === "automatic" ? "Automatic" : "Manual",
              })),
            },
          },
        },
        result: setupResultPresentation,
      };
    } else {
      blocks.push({
        type: "notice",
        id: "create-invitation-unavailable",
        tone: "warn",
        text: "No invitation delivery channel is currently available.",
      });
    }
    blocks.push({
      type: "table",
      id: "invitations",
      empty:
        data.query.state === "pending"
          ? "No pending invitations."
          : "No invitation history yet.",
      query: {
        controls: [
          {
            key: "state",
            label: "View",
            value: data.query.state,
            options: [
              {
                value: "pending",
                label: "Pending",
                count: data.pendingCount,
              },
              {
                value: "history",
                label: "History",
                count: data.historyCount,
              },
            ],
          },
        ],
        pagination: {
          offset: data.query.offset,
          limit: data.query.limit,
          total: data.selectedTotal,
        },
      },
      columns: [
        { key: "person", label: "Person" },
        { key: "role", label: "Role" },
        { key: "state", label: "State" },
        { key: "destination", label: "Destination" },
        { key: "updated", label: "Updated" },
      ],
      rows: data.invitations.map((invitation) => ({
        id: invitation.id,
        cells: {
          person: invitation.displayName,
          role: invitation.role,
          state: invitation.state,
          destination: invitation.destination,
          updated: formatWorkspaceDate(invitation.updatedAt),
        },
        compact: {
          title: invitation.displayName,
          metadata: [
            titleCase(invitation.role),
            invitation.destination,
            formatWorkspaceDate(invitation.updatedAt),
          ],
          badges: [
            {
              label: titleCase(invitation.state),
              tone: invitationTone(invitation.state),
            },
          ],
          tone: invitationTone(invitation.state),
        },
        actions: TERMINAL_INVITATION_STATES.has(invitation.state)
          ? []
          : [
              ...(invitation.deliveryAttemptId
                ? [
                    {
                      action: confirmManualDelivery,
                      input: {
                        invitationId: invitation.id,
                        deliveryAttemptId: invitation.deliveryAttemptId,
                      },
                    },
                  ]
                : []),
              ...(invitation.state !== "sending"
                ? [
                    {
                      action: resendInvitation,
                      input: { invitationId: invitation.id },
                      capability: {
                        id:
                          invitation.state === "failed"
                            ? "retry-invitation"
                            : "resend-invitation",
                        label:
                          invitation.state === "failed" ? "Retry" : "Resend",
                      },
                      result: setupResultPresentation,
                    },
                  ]
                : []),
              {
                action: cancelInvitation,
                input: { invitationId: invitation.id },
              },
            ],
      })),
    });
    return {
      kicker: "Access administration",
      title: "Invitations",
      description:
        "Create, deliver, retry, and revoke passkey invitations without moving auth authority into Studio.",
      status: {
        label: `${data.pendingCount} pending`,
        tone: data.failureCount > 0 ? "warn" : "neutral",
      },
      ...(primaryAction ? { primaryAction } : {}),
      blocks,
    };
  },
});

function mutationContext(caller: OperatorCaller | null): {
  actorUserId: string;
} {
  if (!caller) throw new Error("Invitation action requires a signed-in actor");
  return { actorUserId: caller.actor.id };
}

function setupResult(
  access: Awaited<ReturnType<AuthService["createInvitation"]>>,
): z.output<typeof setupResultSchema> {
  return {
    status:
      access.invitation.state === "sent"
        ? "Delivery provider accepted the invitation."
        : access.invitation.state === "failed"
          ? "Invitation saved, but delivery failed."
          : "Manual delivery is waiting for confirmation.",
    setupUrl: access.registration?.setupUrl ?? null,
    expiresAt: access.registration
      ? new Date(access.registration.expiresAt * 1_000).toISOString()
      : null,
  };
}

export function createInvitationsTabSource(
  context: ServicePluginContext,
): AdminWorkspaceSource {
  const authService = requireAuthService();
  const pendingManualDeliveries = new Map<string, string>();
  const registration = createBuiltInStudioWorkspaceRegistration({
    context,
    definition: studioInvitationsWorkspace,
    bind: (bindingContext) => {
      const create = createInvitation.bind(
        bindingContext,
        async ({ input, caller }) => {
          const access = await authService.createInvitation(
            {
              idempotencyKey: input.idempotencyKey,
              displayName: input.displayName,
              role: input.role,
              delivery: {
                type: input.deliveryType,
                subject: input.deliverySubject,
                ...(input.deliveryLabel ? { label: input.deliveryLabel } : {}),
                mode: input.deliveryMode,
              },
            },
            mutationContext(caller),
          );
          if (
            access.invitation.state === "pending" &&
            access.registration?.deliveryAttemptId
          ) {
            pendingManualDeliveries.set(
              access.invitation.id,
              access.registration.deliveryAttemptId,
            );
          }
          return setupResult(access);
        },
      );
      const resend = resendInvitation.bind(
        bindingContext,
        async ({ input, caller }) => {
          const access = await authService.resendInvitation(
            input.invitationId,
            mutationContext(caller),
          );
          if (
            access.invitation.state === "pending" &&
            access.registration?.deliveryAttemptId
          ) {
            pendingManualDeliveries.set(
              access.invitation.id,
              access.registration.deliveryAttemptId,
            );
          }
          return setupResult(access);
        },
      );
      const cancel = cancelInvitation.bind(
        bindingContext,
        async ({ input, caller }) => {
          const invitation = await authService.cancelInvitation(
            input.invitationId,
            mutationContext(caller),
          );
          pendingManualDeliveries.delete(input.invitationId);
          return { invitationId: invitation.id, state: invitation.state };
        },
        ({ input }) => ({
          summary: "Cancel this invitation and revoke its pending setup link?",
          revision: input.invitationId,
        }),
      );
      const confirm = confirmManualDelivery.bind(
        bindingContext,
        async ({ input, caller }) => {
          const invitation = await authService.confirmManualInvitationDelivery(
            input.invitationId,
            input.deliveryAttemptId,
            mutationContext(caller),
          );
          pendingManualDeliveries.delete(input.invitationId);
          return { invitationId: invitation.id, state: invitation.state };
        },
      );
      return studioInvitationsWorkspace.bind(bindingContext, {
        actions: [create, resend, cancel, confirm],
        load: async ({ query }) => {
          const normalized = query.get(invitationQuerySchema);
          const [users, channels] = await Promise.all([
            authService.listAdminUsers(),
            authService.listInvitationChannels(),
          ]);
          const availableChannels = channels.filter(
            (channel) => channel.deliveryModes.length > 0,
          );
          const invitations = users.filter(
            (user) => user.invitation !== undefined,
          );
          const pending = invitations.filter(
            (user) =>
              user.invitation &&
              !TERMINAL_INVITATION_STATES.has(user.invitation.state),
          );
          const history = invitations.filter(
            (user) =>
              user.invitation &&
              TERMINAL_INVITATION_STATES.has(user.invitation.state),
          );
          const selected = normalized.state === "pending" ? pending : history;
          return {
            query: normalized,
            idempotencyKey: randomUUID(),
            channels: availableChannels.map((channel) => ({
              type: channel.type,
              displayName: channel.displayName,
              subjectLabel: channel.subjectLabel,
              deliveryModes: channel.deliveryModes,
            })),
            invitations: selected
              .slice(normalized.offset, normalized.offset + normalized.limit)
              .flatMap((user) => {
                const invitation = user.invitation;
                if (!invitation) return [];
                const destination =
                  user.identities.find(
                    (identity) => identity.type !== "passkey",
                  )?.label ??
                  user.externalPeers[0]?.peerId ??
                  "Not recorded";
                const deliveryAttemptId = pendingManualDeliveries.get(
                  invitation.id,
                );
                return [
                  {
                    id: invitation.id,
                    displayName: user.displayName,
                    role: user.role,
                    state: invitation.state,
                    destination,
                    updatedAt:
                      invitation.claimedAt ??
                      invitation.cancelledAt ??
                      invitation.expiredAt ??
                      invitation.sentAt ??
                      invitation.updatedAt,
                    ...(deliveryAttemptId ? { deliveryAttemptId } : {}),
                  },
                ];
              }),
            selectedTotal: selected.length,
            pendingCount: pending.length,
            historyCount: history.length,
            failureCount: pending.filter(
              (user) => user.invitation?.state === "failed",
            ).length,
          };
        },
      });
    },
  });
  return adminWorkspaceSource(registration, studioInvitationsWorkspace.actions);
}
