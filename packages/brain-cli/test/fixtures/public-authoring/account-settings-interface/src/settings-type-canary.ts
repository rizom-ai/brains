import {
  UserPermissionLevelSchema,
  defineAccountSettings,
  z,
  type AccountSettingsDefinition,
  type AccountSettingsFieldDefinition,
  type AccountSettingsValue,
  type UserPermissionLevel,
} from "@rizom/brain/interfaces";

// Included by the standalone and packed typechecks, not loaded by a brain.

// An interface's account settings, each field described through its own type.
const passwordField: AccountSettingsFieldDefinition = {
  label: "Password",
  secret: true,
};
const relaySettings = defineAccountSettings({
  title: "Relay",
  schema: z.object({ user: z.string().min(1), password: z.string().min(1) }),
  fields: { user: { label: "Username" }, password: passwordField },
});
export const relaySettingsDefinition: AccountSettingsDefinition = relaySettings;

/** What an account daemon reads for one account, typed by the definition. */
export function relayLogin(
  settings: AccountSettingsValue<typeof relaySettings>,
): string {
  return `${settings.user}:${settings.password.length}`;
}

// A caller's permission, parsed and named by the public permission contract.
export const operatorLevel: UserPermissionLevel =
  UserPermissionLevelSchema.parse("trusted");

// @ts-expect-error A permission level is public, trusted or admin.
const ownerLevel: UserPermissionLevel = "owner";
void ownerLevel;
