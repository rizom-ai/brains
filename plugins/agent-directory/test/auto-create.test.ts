import { describe, it, expect, beforeEach } from "bun:test";
import { AgentDirectoryServicePlugin } from "../src/plugin";
import type { ServicePluginContext } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
  type MockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";

describe("auto-create agent on first contact", () => {
  let shell: MockShell;
  let context: ServicePluginContext;

  beforeEach(async () => {
    shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "agent-directory");

    // Register the plugin so it subscribes to a2a:call:completed
    const plugin = new AgentDirectoryServicePlugin();
    await plugin.register(shell);
  });

  it("should create entity when a2a:call:completed fires for new agent", async () => {
    await shell.getMessageBus().send(
      "a2a:call:completed",
      {
        domain: "remote.io",
        card: {
          brainName: "Remote Brain",
          url: "https://remote.io/a2a",
          description: "A remote agent",
          skills: [
            {
              id: "search",
              name: "Search",
              description: "Search things",
              tags: [],
            },
          ],
          anchor: null,
        },
      },
      "a2a",
    );

    const entity = await context.entityService.getEntity("agent", "remote.io");
    expect(entity).toBeDefined();
    expect(entity?.content).toContain("name: Remote Brain");
    expect(entity?.content).toContain("Search: Search things");
  });

  it("should not overwrite existing entity", async () => {
    // First contact
    await shell.getMessageBus().send(
      "a2a:call:completed",
      {
        domain: "existing.io",
        card: {
          brainName: "Original",
          url: "https://existing.io/a2a",
          description: "",
          skills: [],
          anchor: null,
        },
      },
      "a2a",
    );

    // Second contact — should not overwrite
    await shell.getMessageBus().send(
      "a2a:call:completed",
      {
        domain: "existing.io",
        card: {
          brainName: "Updated",
          url: "https://existing.io/a2a",
          description: "",
          skills: [],
          anchor: null,
        },
      },
      "a2a",
    );

    const entity = await context.entityService.getEntity(
      "agent",
      "existing.io",
    );
    expect(entity?.content).toContain("name: Original");
  });

  it("should use anchor info when available", async () => {
    await shell.getMessageBus().send(
      "a2a:call:completed",
      {
        domain: "yeehaa.io",
        card: {
          brainName: "Yeehaa's Brain",
          url: "https://yeehaa.io/a2a",
          description: "Knowledge brain",
          skills: [],
          anchor: {
            name: "Yeehaa",
            kind: "professional",
            organization: "Rizom",
            description: "Founder of Rizom",
          },
        },
      },
      "a2a",
    );

    const entity = await context.entityService.getEntity("agent", "yeehaa.io");
    expect(entity?.content).toContain("name: Yeehaa");
    expect(entity?.content).toContain("kind: professional");
    expect(entity?.content).toContain("Founder of Rizom");
  });
});
