import type { PluginPrompt } from "@brains/mcp-service";
import type { SystemServices } from "./types";

export function createSystemPrompts(services: SystemServices): PluginPrompt[] {
  const entityTypes = (): string =>
    services.entityService.getEntityTypes().join(", ");

  return [
    {
      name: "create",
      description: "Create new content of any type",
      args: {
        type: {
          description: "Entity type (e.g. post, deck, note)",
          required: true,
        },
        topic: { description: "Topic or title for the content" },
      },
      handler: async ({ topic, type }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: topic
                ? `Create a new ${type} about: ${topic}`
                : `Create a new ${type}. Ask me what it should be about.`,
            },
          },
        ],
      }),
    },
    {
      name: "generate",
      description: "AI-generate content with a prompt",
      args: {
        type: { description: `Entity type (${entityTypes()})`, required: true },
        topic: { description: "What to generate", required: true },
      },
      handler: async ({ type, topic }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generate a ${type} about: ${topic}`,
            },
          },
        ],
      }),
    },
    {
      name: "review",
      description: "Review and improve existing content",
      args: {
        type: { description: "Entity type", required: true },
        id: { description: "Entity ID or slug", required: true },
      },
      handler: async ({ type, id }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review my ${type} "${id}". Read it first, then give me specific feedback on structure, clarity, and impact. Suggest concrete improvements.`,
            },
          },
        ],
      }),
    },
    {
      name: "publish",
      description: "Publish content — preview, confirm, and publish",
      args: {
        type: { description: "Entity type", required: true },
        id: { description: "Entity ID or slug", required: true },
      },
      handler: async ({ type, id }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to publish my ${type} "${id}". Show me a preview first, then publish it.`,
            },
          },
        ],
      }),
    },
    {
      name: "brainstorm",
      description: "Brainstorm ideas using brain context and expertise",
      args: {
        topic: { description: "Topic to brainstorm about", required: true },
      },
      handler: async ({ topic }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Let's brainstorm about: ${topic}. Use my existing content and expertise as context. Give me fresh angles and concrete ideas.`,
            },
          },
        ],
      }),
    },
  ];
}
