import {
  defineServicePlugin,
  z,
  type ServiceInteractionDeclaration,
} from "@rizom/brain/services";

const chat: ServiceInteractionDeclaration = {
  id: "chat",
  label: "Chat",
  href: "/chat",
  kind: "human",
  visibility: "trusted",
  requiresActiveSession: true,
  publishEndpoint: true,
};

export const discoveryCanary = defineServicePlugin(
  { id: "discovery-canary", config: z.object({}) },
  { interactions: () => [chat] },
);

export const invalidPublication: ServiceInteractionDeclaration = {
  ...chat,
  // @ts-expect-error publication is a boolean opt-in, not a registry or callback
  publishEndpoint: () => true,
};

export const forgedOwner: ServiceInteractionDeclaration = {
  ...chat,
  // @ts-expect-error the installed runtime supplies discovery ownership
  pluginId: "another-package",
};
