import { createTestEntity } from "@brains/entity-service/test";
import { afterEach, describe, expect, it } from "bun:test";
import { baseEntitySchema, createPluginHarness } from "@brains/plugins/test";
import { waitUntil } from "@brains/test-utils";
import { DirectorySyncPlugin } from "../src/plugin";
import { MockEntityAdapter } from "./fixtures";

describe("startup durable entity-export recovery", () => {
  const harness = createPluginHarness();

  afterEach(async () => {
    await harness.reset();
  });

  it("keeps boot available and retries when the startup drain fails", async () => {
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
    const plugin = new DirectorySyncPlugin({
      autoSync: false,
      initialSync: false,
      commitDebounce: 100,
    });
    await harness.installPlugin(plugin);

    const entityService = harness.getEntityService();
    const entity = createTestEntity("note", {
      id: "pending-at-offline-startup",
      content: "Must survive an unavailable export destination",
    });
    await entityService.upsertEntity({ entity });
    const acknowledge =
      entityService.acknowledgeEntityExports.bind(entityService);
    let acknowledgementAttempts = 0;
    entityService.acknowledgeEntityExports = async (
      request,
    ): Promise<number> => {
      acknowledgementAttempts += 1;
      if (acknowledgementAttempts === 1) {
        throw new Error("simulated unavailable export destination");
      }
      return acknowledge(request);
    };

    await plugin.ready();
    expect(await entityService.hasPendingEntityExports()).toBe(true);

    await waitUntil(
      () => acknowledgementAttempts >= 2,
      "the durable startup export retry",
    );
    expect(await entityService.hasPendingEntityExports()).toBe(false);
  });
});
