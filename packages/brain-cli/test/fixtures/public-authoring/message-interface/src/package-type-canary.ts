import {
  defineInterface,
  defineMessageInterface,
  defineMessageInterfacePackage,
  z,
} from "@rizom/brain/interfaces";

// One config for every interface the package may run.
const notifyConfig = z.object({
  rooms: z.object({ token: z.string() }).optional(),
  pager: z.object({ number: z.string() }).optional(),
});

const rooms = defineMessageInterface(
  {
    id: "rooms",
    config: notifyConfig,
    channel: {
      type: "rooms",
      displayName: "Rooms",
      subjectLabel: "Room",
      recipient: z.object({ room: z.string() }),
    },
  },
  {
    deliver: ({ config, recipient, message }) =>
      `${config.rooms?.token ?? "anonymous"}:${recipient.room}:${message.text}`,
  },
);

const pager = defineMessageInterface(
  {
    id: "pager",
    config: notifyConfig,
    channel: {
      type: "pager",
      displayName: "Pager",
      subjectLabel: "Number",
      recipient: z.string(),
    },
  },
  { deliver: ({ recipient }) => recipient },
);

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
// The interfaces that run are a fact about the config: one without
// credentials is not declared.
export const packageTypeCanary = defineMessageInterfacePackage({
  id: "notify",
  config: notifyConfig,
  interfaces: ({ config }) => [
    ...(config.rooms ? [rooms] : []),
    ...(config.pager ? [pager] : []),
  ],
});

export function refusedInterfaces(): void {
  const elsewhere = defineMessageInterface(
    {
      id: "elsewhere",
      config: z.object({ token: z.string() }),
      channel: {
        type: "elsewhere",
        displayName: "Elsewhere",
        subjectLabel: "Room",
        recipient: z.string(),
      },
    },
    { deliver: () => undefined },
  );
  defineMessageInterfacePackage({
    id: "mixed",
    config: notifyConfig,
    // @ts-expect-error Every interface in a package is declared over its config.
    interfaces: () => [elsewhere],
  });

  const webhook = defineInterface({ id: "webhook", config: notifyConfig });
  defineMessageInterfacePackage({
    id: "generic",
    config: notifyConfig,
    // @ts-expect-error A message interface package holds message interfaces.
    interfaces: () => [webhook],
  });
}
