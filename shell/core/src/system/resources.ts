import type { PluginResource } from "@brains/mcp-service";
import type { SystemServices } from "./types";

export function createSystemResources(
  services: SystemServices,
): PluginResource[] {
  return [
    {
      uri: "entity://types",
      name: "Entity Types",
      description: "List of registered entity types",
      mimeType: "text/plain",
      handler: async () => ({
        contents: [
          {
            uri: "entity://types",
            mimeType: "text/plain",
            text: services.entityService.getEntityTypes().join("\n"),
          },
        ],
      }),
    },
    {
      uri: "brain://identity",
      name: "Brain Identity",
      description: "Brain character — name, role, purpose, values",
      mimeType: "application/json",
      handler: async () => ({
        contents: [
          {
            uri: "brain://identity",
            mimeType: "application/json",
            text: JSON.stringify(services.getIdentity(), null, 2),
          },
        ],
      }),
    },
    {
      uri: "brain://profile",
      name: "Anchor Profile",
      description: "Brain owner profile — name, bio, expertise",
      mimeType: "application/json",
      handler: async () => ({
        contents: [
          {
            uri: "brain://profile",
            mimeType: "application/json",
            text: JSON.stringify(services.getProfile(), null, 2),
          },
        ],
      }),
    },
  ];
}
