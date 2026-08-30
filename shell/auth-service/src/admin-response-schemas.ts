/**
 * Runtime schemas for the admin HTTP responses.
 *
 * These live beside admin-contracts rather than in it: that module is
 * deliberately dependency-free browser vocabulary. Each schema is annotated
 * with the interface it must produce, so the compiler checks the schema and
 * the contract agree — a field added to one and not the other fails to build.
 *
 * The admin console previously asserted `body as T` on every fetch, trusting
 * whatever the server returned.
 */
import { z } from "@brains/utils/zod";
import {
  AUTH_BRAIN_ANCHOR_CONFIG_KINDS,
  AUTH_BRAIN_ANCHOR_KINDS,
  AUTH_USER_ROLES,
  AUTH_USER_STATUSES,
  type AuthAdminAuditResponse,
  type AuthAdminChannelsResponse,
  type AuthAdminUsersResponse,
  type AuthBrainAnchorResponse,
} from "./admin-contracts";

const roleSchema = z.enum(AUTH_USER_ROLES);
const statusSchema = z.enum(AUTH_USER_STATUSES);

const identitySummarySchema = z.object({
  id: z.string(),
  personId: z.string(),
  userId: z.string(),
  type: z.string(),
  visibility: z.enum(["private", "trusted", "public"]),
  evidence: z.array(
    z.object({
      sourceKind: z.enum(["admin", "agent", "migration", "provider"]),
      sourceId: z.string().optional(),
      assurance: z.enum(["asserted", "verified"]),
      verifiedAt: z.number().optional(),
    }),
  ),
  issuer: z.string().optional(),
  label: z.string().optional(),
  verifiedAt: z.number().optional(),
  revokedAt: z.number().optional(),
  createdAt: z.number(),
});

const passkeySummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  transports: z.array(z.string()).optional(),
  credentialDeviceType: z.string().optional(),
  credentialBackedUp: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const externalPeerSummarySchema = z.object({
  peerId: z.string(),
  personId: z.string(),
  verificationStatus: z.enum(["unverified", "verified"]),
  createdByUserId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const invitationSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  state: z.enum([
    "pending",
    "sending",
    "sent",
    "claimed",
    "expired",
    "cancelled",
    "failed",
  ]),
  failureCode: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  sentAt: z.number().optional(),
  claimedAt: z.number().optional(),
  expiredAt: z.number().optional(),
  cancelledAt: z.number().optional(),
});

const userSummarySchema = z.object({
  userId: z.string(),
  personId: z.string(),
  displayName: z.string(),
  role: roleSchema,
  status: statusSchema,
  permissionLevel: roleSchema,
  isAnchor: z.boolean(),
  canonicalId: z.string().optional(),
  profileEntityId: z.string().optional(),
  invitation: invitationSummarySchema.optional(),
  identities: z.array(identitySummarySchema),
  passkeys: z.array(passkeySummarySchema),
  externalPeers: z.array(externalPeerSummarySchema),
});

const brainAnchorSummarySchema = z.object({
  kind: z.enum(AUTH_BRAIN_ANCHOR_KINDS),
  configuredKind: z.enum(AUTH_BRAIN_ANCHOR_CONFIG_KINDS),
  subjectId: z.string(),
  displayName: z.string(),
  personId: z.string().optional(),
  profileEntityId: z.string().optional(),
  administeredBy: z.number(),
});

const auditEventSummarySchema = z.object({
  id: z.string(),
  actorUserId: z.string().optional(),
  action: z.string(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
});

const invitationChannelSummarySchema = z.object({
  type: z.string(),
  displayName: z.string(),
  subjectLabel: z.string(),
  subjectPattern: z
    .object({ source: z.string(), flags: z.string().optional() })
    .optional(),
  deliveryModes: z.array(z.enum(["automatic", "manual"])),
});

export const authBrainAnchorResponseSchema: z.ZodType<AuthBrainAnchorResponse> =
  z.object({ anchor: brainAnchorSummarySchema });

export const authAdminUsersResponseSchema: z.ZodType<AuthAdminUsersResponse> =
  z.object({ users: z.array(userSummarySchema) });

export const authAdminChannelsResponseSchema: z.ZodType<AuthAdminChannelsResponse> =
  z.object({ channels: z.array(invitationChannelSummarySchema) });

export const authAdminAuditResponseSchema: z.ZodType<AuthAdminAuditResponse> =
  z.object({ events: z.array(auditEventSummarySchema) });
