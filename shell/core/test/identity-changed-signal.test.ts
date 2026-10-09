import { describe, expect, it } from "bun:test";
import { ENTITY_CHANNELS } from "@brains/contracts";
import { MessageBus } from "@brains/messaging-service";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { subscribeToIdentityRefresh } from "../src/initialization/identity-agent-services";

describe("identity changed signal", () => {
  const logger = createSilentLogger();

  function observeIdentitySignal(): {
    messageBus: MessageBus;
    seen: string[];
  } {
    const messageBus = MessageBus.createFresh(logger);
    let cachedName = "Unknown";
    const seen: string[] = [];

    subscribeToIdentityRefresh(
      messageBus,
      "anchor-profile",
      async () => {
        await Bun.sleep(0);
        cachedName = "Taeke";
      },
      logger,
    );
    messageBus.subscribe(SYSTEM_CHANNELS.identityChanged, async () => {
      seen.push(cachedName);
      return { success: true };
    });

    return { messageBus, seen };
  }

  it("fires only after the identity cache has refreshed", async () => {
    const { messageBus, seen } = observeIdentitySignal();

    for (const type of [
      ENTITY_CHANNELS.created,
      ENTITY_CHANNELS.updated,
      ENTITY_CHANNELS.deleted,
    ]) {
      await messageBus.send({
        type,
        payload: { entityType: "anchor-profile", entityId: "anchor-profile" },
        sender: "entity-service",
        broadcast: true,
      });
    }

    expect(seen).toEqual(["Taeke", "Taeke", "Taeke"]);
  });

  it("stays quiet for other entity types", async () => {
    const { messageBus, seen } = observeIdentitySignal();

    await messageBus.send({
      type: ENTITY_CHANNELS.updated,
      payload: { entityType: "note", entityId: "anchor-profile" },
      sender: "entity-service",
      broadcast: true,
    });

    expect(seen).toEqual([]);
  });
});
