import type { AuthAdminUserSummary } from "@brains/auth-service";
import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { formatWorkspaceDate, requireAuthService } from "./workspace-format";

export const EXPIRING_INVITATION_WINDOW_MS: number = 3 * 24 * 60 * 60 * 1_000;

const invitationAttentionSchema: z.ZodObject<
  {
    id: z.ZodString;
    displayName: z.ZodString;
    state: z.ZodString;
    reason: z.ZodEnum<{
      expiring: "expiring";
      "delivery-failed": "delivery-failed";
    }>;
    expiresAt: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strict
> = z.strictObject({
  id: z.string(),
  displayName: z.string(),
  state: z.string(),
  reason: z.enum(["expiring", "delivery-failed"]),
  expiresAt: z.number().optional(),
});

export type InvitationAttention = z.output<typeof invitationAttentionSchema>;

const invitationsOverviewDataSchema: z.ZodObject<
  {
    invitations: z.ZodArray<typeof invitationAttentionSchema>;
    expiringCount: z.ZodNumber;
    failureCount: z.ZodNumber;
  },
  z.core.$strict
> = z.strictObject({
  invitations: z.array(invitationAttentionSchema),
  expiringCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
});

export type InvitationsOverviewData = z.output<
  typeof invitationsOverviewDataSchema
>;

const invitationsOverviewWidget = defineDashboardWidget({
  id: "expiring-invitations",
  title: "Invitations",
  description: "Setup links that expire soon or need delivery attention",
  group: "access",
  placement: "primary",
  priority: 5,
  permission: "admin",
  data: invitationsOverviewDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "Expiring soon",
        value: String(data.expiringCount),
        ...(data.expiringCount > 0 ? { tone: "warn" } : {}),
      },
      {
        label: "Delivery failures",
        value: String(data.failureCount),
        ...(data.failureCount > 0 ? { tone: "warn" } : {}),
      },
    ],
    attention: data.invitations.length,
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "stats",
        items: [
          {
            label: "Expiring soon",
            value: data.expiringCount,
            tone: data.expiringCount > 0 ? "warn" : "good",
          },
          {
            label: "Delivery failures",
            value: data.failureCount,
            tone: data.failureCount > 0 ? "warn" : "good",
          },
        ],
      },
      {
        type: "list",
        id: "invitation-attention",
        empty: "No invitation setup links need attention.",
        items: data.invitations.map((invitation) => ({
          id: invitation.id,
          title: invitation.displayName,
          description:
            invitation.reason === "delivery-failed"
              ? "Invitation delivery failed. Resend or cancel it."
              : "The single-use setup link expires soon.",
          metadata: [
            invitation.state,
            ...(invitation.expiresAt !== undefined
              ? [`Expires ${formatWorkspaceDate(invitation.expiresAt)}`]
              : []),
          ],
          tone: invitation.reason === "delivery-failed" ? "error" : "warn",
          link: { launch: { target: "invitations" } },
        })),
      },
      {
        type: "links",
        items: [
          {
            label: "Open Invitations",
            target: { launch: { target: "invitations" } },
          },
        ],
      },
    ],
  }),
});

export function deriveInvitationsOverview(
  users: readonly Pick<AuthAdminUserSummary, "displayName" | "invitation">[],
  now: number,
): InvitationsOverviewData {
  const invitations = users.flatMap((user): InvitationAttention[] => {
    const invitation = user.invitation;
    if (!invitation) return [];
    if (invitation.state === "failed") {
      return [
        {
          id: invitation.id,
          displayName: user.displayName,
          state: invitation.state,
          reason: "delivery-failed",
          ...(invitation.expiresAt !== undefined
            ? { expiresAt: invitation.expiresAt }
            : {}),
        },
      ];
    }
    if (
      !["pending", "sending", "sent"].includes(invitation.state) ||
      invitation.expiresAt === undefined ||
      invitation.expiresAt <= now ||
      invitation.expiresAt > now + EXPIRING_INVITATION_WINDOW_MS
    ) {
      return [];
    }
    return [
      {
        id: invitation.id,
        displayName: user.displayName,
        state: invitation.state,
        reason: "expiring",
        expiresAt: invitation.expiresAt,
      },
    ];
  });
  invitations.sort(
    (left, right) =>
      (left.expiresAt ?? Number.MAX_SAFE_INTEGER) -
        (right.expiresAt ?? Number.MAX_SAFE_INTEGER) ||
      left.displayName.localeCompare(right.displayName),
  );
  return {
    invitations,
    expiringCount: invitations.filter(
      (invitation) => invitation.reason === "expiring",
    ).length,
    failureCount: invitations.filter(
      (invitation) => invitation.reason === "delivery-failed",
    ).length,
  };
}

export async function registerInvitationsOverview(
  context: ServicePluginContext,
): Promise<void> {
  await registerBuiltInDashboardWidget({
    context,
    definition: invitationsOverviewWidget,
    load: async ({ signal }) => {
      signal.throwIfAborted();
      const users = await requireAuthService().listAdminUsers();
      signal.throwIfAborted();
      return deriveInvitationsOverview(users, Date.now());
    },
  });
}
