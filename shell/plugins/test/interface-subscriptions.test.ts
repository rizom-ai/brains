import { afterEach, describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineInterface,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A plain interface answers requests on the bus too: Studio asks the A2A
 * interface to call a peer, and only that interface knows how. Message
 * interfaces already declared subscriptions; the slot moves up to every
 * interface. Named consumer: @brains/a2a.
 */
describe("interface subscriptions", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("interface-subscriptions-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<void> {
    const [plugin] = instantiatePluginPackageDefinition(
      defineInterface(
        {
          id: "peers",
          config: z.object({}),
        },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "peers:approved",
              payload: z.object({ minimum: z.number() }),
              handle: async ({ payload, entities }) => {
                if (!entities.getEntityTypes().includes("agent")) {
                  return { agents: [] };
                }
                const agents = await entities.listEntities({
                  entityType: "agent",
                  options: {
                    filter: {
                      metadata: { status: "approved" },
                      visibilityScope: "restricted",
                    },
                  },
                });
                return {
                  agents: agents
                    .map(({ id }) => id)
                    .filter((id) => id.length >= payload.minimum),
                };
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/peers", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Interface plugin was not created");
    await harness.installPlugin(plugin);
  }

  it("answers a request with reads filtered the way the handler asked", async () => {
    harness.addEntities([
      createTestEntity("agent", {
        id: "kai.brain",
        content: "Kai",
        visibility: "restricted",
        metadata: { status: "approved" },
      }),
      createTestEntity("agent", {
        id: "noor.brain",
        content: "Noor",
        visibility: "public",
        metadata: { status: "discovered" },
      }),
    ]);
    await install();

    const response = await harness.sendMessage("peers:approved", {
      minimum: 1,
    });

    expect(response).toEqual({ agents: ["kai.brain"] });
  });

  it("refuses a malformed request before the handler runs", async () => {
    await install();

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: "peers:approved",
        payload: { minimum: "one" },
        sender: "t",
      });

    expect(response).toMatchObject({
      success: false,
      code: "invalid_input",
      error: "Invalid input",
    });
  });
});
