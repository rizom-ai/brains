import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  parseAgentCard,
  type AnchorProfile,
  type BrainCharacter,
  type ParsedAgentCard,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { A2AInterface } from "../src/a2a-interface";

/**
 * Regression: a brain whose identity lands after startup kept serving
 * "Brain is Unknown's ..." because the card was built once at ready.
 * The served card must follow the brain's current identity and skills.
 */
describe("Agent Card follows the brain's current identity", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-card-identity"),
    });
    harness.getMockShell().addPlugin({
      id: "webserver",
      version: "1.0.0",
      type: "interface",
      packageName: "@brains/webserver",
      register: async () => ({ tools: [], resources: [] }),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    await harness.reset();
  });

  async function installA2A(): Promise<A2AInterface> {
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    harness.getMockShell().getProfileKindRegistry().finalize();
    return plugin;
  }

  async function fetchCard(plugin: A2AInterface): Promise<Response> {
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/.well-known/agent-card.json");
    if (!route) throw new Error("Expected agent card route");
    return route.handler(
      new Request("http://brain/.well-known/agent-card.json"),
    );
  }

  async function readCard(plugin: A2AInterface): Promise<ParsedAgentCard> {
    const response = await fetchCard(plugin);
    expect(response.status).toBe(200);
    const card = parseAgentCard(await response.json());
    if (!card) throw new Error("Expected a valid agent card");
    return card;
  }

  test("is not served before the brain is ready", async () => {
    const plugin = await installA2A();

    const response = await fetchCard(plugin);

    expect(response.status).toBe(503);
  });

  test("serves identity stored after startup", async () => {
    const plugin = await installA2A();
    await plugin.ready();
    expect((await readCard(plugin)).description).toContain("Test Owner's");

    const shell = harness.getMockShell();
    shell.getProfile = (): AnchorProfile => ({ name: "Taeke" });
    shell.getIdentity = (): BrainCharacter => ({
      name: "Swift Specialist",
      role: "Knowledge organization assistant",
      purpose: "Organize knowledge",
      values: ["clarity"],
    });

    const card = await readCard(plugin);
    expect(card.brainName).toBe("Swift Specialist");
    expect(card.description).toContain("Taeke's");
    expect(card.anchor?.name).toBe("Taeke");
  });

  test("serves skills stored after startup", async () => {
    const plugin = await installA2A();
    await plugin.ready();

    await harness
      .getMockShell()
      .getEntityService()
      .createEntity({
        entity: {
          id: "late-skill",
          entityType: "skill",
          content: "",
          visibility: "public",
          metadata: {
            name: "Late Skill",
            description: "Derived after startup",
            tags: [],
            examples: [],
          },
        },
      });

    const card = await readCard(plugin);
    expect(card.skills.map((skill) => skill.name)).toContain("Late Skill");
  });
});
