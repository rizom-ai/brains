import { afterEach, describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { defineInterface, instantiatePluginPackageDefinition } from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * An interface that presents the brain to a peer describes it: who it is,
 * what kind of profile it represents, and what it offers publicly. Those
 * are reads the runtime already answers; a declaration could not reach
 * them. Named consumer: @brains/a2a, whose Agent Card is built from them.
 */
describe("interface presentation reads", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("interface-presentation-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("hands setup the brain's identity, profile kind, public tools and skills, and instructions the agent", async () => {
    harness.addEntities([
      createTestEntity("agent", {
        id: "kai.brain",
        content: "Kai",
        visibility: "public",
        metadata: { status: "approved" },
      }),
    ]);
    let described: Record<string, unknown> | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineInterface(
        {
          id: "card",
          config: z.object({}),
          setup: ({
            identity,
            profileKinds,
            tools,
            publicSkills,
            entities,
          }) => {
            described = {
              character: identity.get().name,
              profile: identity.getProfile().name,
              // Asked lazily: the selection finalizes after every plugin has
              // registered, so a card built at setup would read too early.
              kind: (): ReturnType<typeof profileKinds.getResolved> =>
                profileKinds.getResolved(),
              publicTools: tools.listForPermissionLevel("public").length,
              skills: publicSkills.list(),
              types: entities.getEntityTypes(),
              agents: entities.listEntities({
                entityType: "agent",
                options: { filter: { visibilityScope: "public" } },
              }),
            };
            return {};
          },
        },
        {
          instructions: () => "Call peers through this interface.",
        },
      ),
      {},
      { name: "@fixture/card", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Interface plugin was not created");

    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.instructions).toBe(
      "Call peers through this interface.",
    );
    if (!described) throw new Error("setup did not run");
    expect(typeof described["character"]).toBe("string");
    expect(typeof described["profile"]).toBe("string");
    expect(typeof described["publicTools"]).toBe("number");
    harness.getMockShell().getProfileKindRegistry().finalize();
    const kind = described["kind"];
    expect(typeof kind).toBe("function");
    if (typeof kind === "function") expect(kind()).toBeDefined();
    expect(await described["skills"]).toEqual([]);
    expect(described["types"]).toContain("agent");
    expect(await described["agents"]).toMatchObject([{ id: "kai.brain" }]);
  });
});
