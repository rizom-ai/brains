import { z } from "@brains/utils/zod";

/** Private owner/worker access; account settings mutations remain control-plane operations. */
export const AUTH_ACCOUNT_SETTINGS_READ_CHANNEL = "auth:account-settings:read";

export type AuthAccountSettingsReadRequest =
  | {
      operation: "read";
      packageName: string;
      definitionId: string;
      actorId: string;
    }
  | { operation: "list"; packageName: string; definitionId: string };

export const authAccountSettingsReadRequestSchema: z.ZodType<AuthAccountSettingsReadRequest> =
  z.discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("read"),
      packageName: z.string().min(1),
      definitionId: z.string().min(1),
      actorId: z.string().min(1),
    }),
    z.strictObject({
      operation: z.literal("list"),
      packageName: z.string().min(1),
      definitionId: z.string().min(1),
    }),
  ]);

export interface AuthStoredAccountSettings {
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly revision: number;
}

export const authStoredAccountSettingsSchema: z.ZodType<AuthStoredAccountSettings> =
  z.strictObject({
    values: z.record(
      z.string(),
      z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    ),
    revision: z.number().int().nonnegative(),
  });

export const authConfiguredAccountSettingsSchema: z.ZodType<
  readonly (AuthStoredAccountSettings & { readonly actorId: string })[]
> = z.array(
  z.strictObject({
    actorId: z.string().min(1),
    values: z.record(
      z.string(),
      z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    ),
    revision: z.number().int().nonnegative(),
  }),
);
