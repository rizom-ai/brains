import { describe, it, expect, mock, beforeEach } from "bun:test";
import { AgentDirectoryServicePlugin } from "../src/plugin";
import type { ServicePluginContext } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
  type MockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";

function createMockFetch(cards: Record<string, unknown>) {
  return mock(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    for (const [domain, card] of Object.entries(cards)) {
      if (urlStr.includes(domain)) {
        return new Response(JSON.stringify(card), { status: 200 });
      }
    }
    return new Response("Not found", { status: 404 });
  });
}

const remoteCard = {
  name: "Remote Brain",
  url: "https://remote.io/a2a",
  description: "A remote agent",
  skills: [{ id: "search", description: "Search things" }],
};

const yeehaaCard = {
  name: "Yeehaa's Brain",
  url: "https://yeehaa.io/a2a",
  description: "Knowledge brain",
  capabilities: {
    extensions: [
      {
        uri: "https://rizom.ai/ext/anchor-profile/v1",
        params: {
          name: "Yeehaa",
          kind: "professional",
          organization: "Rizom",
          description: "Founder of Rizom",
        },
      },
    ],
  },
};

describe("auto-create agent on first contact", () => {
  let shell: MockShell;
  let context: ServicePluginContext;

  beforeEach(async () => {
    const mockFetch = createMockFetch({
      "remote.io": remoteCard,
      "existing.io": remoteCard,
      "yeehaa.io": yeehaaCard,
    });

    shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "agent-directory");

    const plugin = new AgentDirectoryServicePlugin({ fetch: mockFetch });
    await plugin.register(shell);
  });

  it("should create entity when a2a:call:completed fires for new agent", async () => {
    await shell
      .getMessageBus()
      .send("a2a:call:completed", { domain: "remote.io" }, "a2a");

    const entity = await context.entityService.getEntity("agent", "remote.io");
    expect(entity).toBeDefined();
    expect(entity?.content).toContain("name: Remote Brain");
  });

  it("should not overwrite existing entity", async () => {
    await shell
      .getMessageBus()
      .send("a2a:call:completed", { domain: "existing.io" }, "a2a");

    // Second send — should not overwrite
    await shell
      .getMessageBus()
      .send("a2a:call:completed", { domain: "existing.io" }, "a2a");

    const entity = await context.entityService.getEntity(
      "agent",
      "existing.io",
    );
    expect(entity?.content).toContain("name: Remote Brain");
  });

  it("should use anchor info when available", async () => {
    await shell
      .getMessageBus()
      .send("a2a:call:completed", { domain: "yeehaa.io" }, "a2a");

    const entity = await context.entityService.getEntity("agent", "yeehaa.io");
    expect(entity?.content).toContain("name: Yeehaa");
    expect(entity?.content).toContain("kind: professional");
    expect(entity?.content).toContain("Founder of Rizom");
  });
});
