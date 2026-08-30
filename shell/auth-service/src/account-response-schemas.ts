/**
 * Runtime schemas for the /auth/account responses.
 *
 * Same rationale as admin-response-schemas: the account console previously
 * asserted `body as T` on every fetch. Each schema is annotated with the
 * interface it must produce, so the compiler checks schema and contract agree.
 */
import { z } from "@brains/utils/zod";
import type {
  AuthAccountResponse,
  AuthAccountSnapshot,
} from "./account-contracts";

const passkeySchema = z.object({
  id: z.string(),
  transports: z.array(z.string()).optional(),
  credentialDeviceType: z.string().optional(),
  credentialBackedUp: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const connectedChannelSchema = z.object({
  type: z.string(),
  label: z.string(),
  verifiedAt: z.number(),
});

const sessionSummarySchema = z.object({
  id: z.string(),
  current: z.boolean(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

const pluginSettingsFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  control: z.enum(["text", "url", "number", "checkbox"]),
  secret: z.boolean(),
  required: z.boolean(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  set: z.boolean().optional(),
});

const pluginSettingsFormSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  configured: z.boolean(),
  revision: z.number().nullable(),
  fields: z.array(pluginSettingsFieldSchema),
});

export const authAccountSnapshotSchema: z.ZodType<AuthAccountSnapshot> =
  z.object({
    displayName: z.string(),
    role: z.enum(["admin", "trusted", "public"]),
    profileEntityId: z.string().optional(),
    passkeys: z.array(passkeySchema),
    connectedChannels: z.array(connectedChannelSchema),
    pluginSettings: z.array(pluginSettingsFormSchema),
    sessions: z.array(sessionSummarySchema),
  });

export const authAccountResponseSchema: z.ZodType<AuthAccountResponse> =
  z.object({ account: authAccountSnapshotSchema });

/** The verify endpoint returns the snapshot plus a literal `verified: true`. */
export const authAccountVerifiedResponseSchema: z.ZodType<
  AuthAccountResponse & { verified: true }
> = z.object({
  account: authAccountSnapshotSchema,
  verified: z.literal(true),
});
