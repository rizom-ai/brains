import { describe, expect, it, mock } from "bun:test";
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

  it("does not announce a rejected cache refresh callback", async () => {
    const messageBus = MessageBus.createFresh(logger);
    const refresh = mock(async () => {
      throw new Error("Identity read failed");
    });
    const seen = mock(async () => ({ success: true }));
    subscribeToIdentityRefresh(messageBus, "anchor-profile", refresh, logger);
    messageBus.subscribe(SYSTEM_CHANNELS.identityChanged, seen);
    await messageBus.send({
      type: ENTITY_CHANNELS.updated,
      payload: { entityType: "anchor-profile", entityId: "anchor-profile" },
      sender: "entity-service",
      broadcast: true,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen).not.toHaveBeenCalled();
  });

  it("ignores other singleton ids and releases all subscriptions", async () => {
    const messageBus = MessageBus.createFresh(logger);
    const refresh = mock(async () => undefined);
    const seen = mock(async () => ({ success: true }));
    const unsubscribe = subscribeToIdentityRefresh(
      messageBus,
      "anchor-profile",
      refresh,
      logger,
    );
    messageBus.subscribe(SYSTEM_CHANNELS.identityChanged, seen);
    await messageBus.send({
      type: ENTITY_CHANNELS.updated,
      payload: { entityType: "anchor-profile", entityId: "not-the-singleton" },
      sender: "entity-service",
      broadcast: true,
    });
    expect(refresh).not.toHaveBeenCalled();
    for (const dispose of unsubscribe) dispose();
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
    expect(refresh).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
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
