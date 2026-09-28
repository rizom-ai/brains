import {
  z,
  type WorkspaceActionFormFieldDefinition,
  type WorkspaceActionResultDefinition,
} from "@brains/sdk/services";

/** An action that reports only how it went. */
export const statusResultSchema: z.ZodObject<
  { status: z.ZodString },
  z.core.$strict
> = z.strictObject({ status: z.string() });

/** An action that hands back a single-use setup link. */
export const setupResultSchema: z.ZodObject<
  { status: z.ZodString; setupUrl: z.ZodURL; expiresAt: z.ZodString },
  z.core.$strict
> = z.strictObject({
  status: z.string(),
  setupUrl: z.url(),
  expiresAt: z.string(),
});

/** How a setup result is shown: the link is copyable and never on display. */
export function setupResultPresentation(
  title: string,
): WorkspaceActionResultDefinition<typeof setupResultSchema> {
  return {
    title,
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
}

/** A channel an invitation can be delivered through. */
export const invitationChannelSchema: z.ZodObject<
  {
    type: z.ZodString;
    displayName: z.ZodString;
    subjectLabel: z.ZodString;
    deliveryModes: z.ZodArray<
      z.ZodEnum<{ automatic: "automatic"; manual: "manual" }>
    >;
  },
  z.core.$strict
> = z.strictObject({
  type: z.string(),
  displayName: z.string(),
  subjectLabel: z.string(),
  deliveryModes: z.array(z.enum(["automatic", "manual"])),
});

export type InvitationChannel = z.output<typeof invitationChannelSchema>;
export type InvitationDeliveryMode = InvitationChannel["deliveryModes"][number];

/** Every delivery mode at least one channel offers. */
export function invitationDeliveryModes(
  channels: readonly InvitationChannel[],
): InvitationDeliveryMode[] {
  return Array.from(
    new Set(channels.flatMap((channel) => channel.deliveryModes)),
  );
}

/** The roles an invitation can grant; public people need no invitation. */
export function invitationRoleField(
  label: string,
): WorkspaceActionFormFieldDefinition {
  return {
    label,
    control: "select",
    options: [
      { value: "trusted", label: "Trusted" },
      { value: "admin", label: "Admin" },
    ],
  };
}

/** Where and how an invitation is delivered; the destination's label follows the channel. */
export function invitationDeliveryFields(
  channels: readonly InvitationChannel[],
  modes: readonly InvitationDeliveryMode[],
): {
  deliveryType: WorkspaceActionFormFieldDefinition;
  deliverySubject: WorkspaceActionFormFieldDefinition;
  deliveryLabel: WorkspaceActionFormFieldDefinition;
  deliveryMode: WorkspaceActionFormFieldDefinition;
} {
  return {
    deliveryType: {
      label: "Delivery channel",
      control: "select",
      options: channels.map((channel) => ({
        value: channel.type,
        label: channel.displayName,
      })),
    },
    deliverySubject: {
      label: "Delivery destination",
      labelBy: {
        field: "deliveryType",
        values: channels.map((channel) => ({
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
      options: modes.map((mode) => ({
        value: mode,
        label: mode === "automatic" ? "Automatic" : "Manual",
      })),
    },
  };
}
