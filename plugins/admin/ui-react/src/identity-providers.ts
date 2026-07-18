import type { AuthAdminIdentityType } from "@brains/auth-service/admin-contracts";

export type ManualIdentityType = Exclude<AuthAdminIdentityType, "passkey">;

export function manualIdentityTypes(
  registeredInterfaces: readonly string[],
): ManualIdentityType[] {
  const types: ManualIdentityType[] = ["oauth"];
  if (registeredInterfaces.includes("email-resend")) types.push("email");
  if (registeredInterfaces.includes("discord")) types.push("discord");
  return types;
}
