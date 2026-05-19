import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";
import { createMockMCPService, createSilentLogger } from "@brains/test-utils";
import { registerSystemCapabilities } from "../../src/system/register";
import { createMockSystemServices } from "./mock-services";

const makeEntity = (id: string, visibility: ContentVisibility): BaseEntity => ({
  id,
  entityType: "doc",
  content: `body of ${id}`,
  contentHash: `hash-${id}`,
  visibility,
  metadata: { title: id },
  created: "2026-05-01T00:00:00.000Z",
  updated: "2026-05-01T00:00:00.000Z",
});

describe("registerSystemCapabilities message bus wiring", () => {
  let messageBus: MessageBus;
  let services: ReturnType<typeof createMockSystemServices>;
  let unsubscribe: () => void;

  beforeEach(() => {
    const logger = createSilentLogger("register-test");
    messageBus = MessageBus.createFresh(logger);
    services = createMockSystemServices();
    services.addEntities([
      makeEntity("doc-public", "public"),
      makeEntity("doc-shared", "shared"),
      makeEntity("doc-restricted", "restricted"),
    ]);
    unsubscribe = registerSystemCapabilities(
      services,
      createMockMCPService(),
      messageBus,
      logger,
    );
  });

  afterEach(() => {
    unsubscribe();
  });

  const callSystemList = async (
    userPermissionLevel?: "anchor" | "trusted" | "public",
  ): Promise<BaseEntity[]> => {
    const response = await messageBus.send<unknown, { data: unknown }>({
      type: "plugin:system:tool:execute",
      payload: {
        toolName: "system_list",
        args: { entityType: "doc" },
        interfaceType: "test",
        userId: "test",
        ...(userPermissionLevel && { userPermissionLevel }),
      },
      sender: "test",
    });

    const inner = (response as { data: unknown }).data as {
      data: { entities: BaseEntity[] };
    };
    return inner.data.entities;
  };

  it("propagates anchor userPermissionLevel from message payload to tool context", async () => {
    const entities = await callSystemList("anchor");
    const ids = entities.map((e) => e.id).sort();
    expect(ids).toEqual(["doc-public", "doc-restricted", "doc-shared"]);
  });

  it("propagates trusted userPermissionLevel from message payload to tool context", async () => {
    const entities = await callSystemList("trusted");
    const ids = entities.map((e) => e.id).sort();
    expect(ids).toEqual(["doc-public", "doc-shared"]);
  });

  it("defaults to public scope when userPermissionLevel is absent in payload", async () => {
    const entities = await callSystemList();
    const ids = entities.map((e) => e.id).sort();
    expect(ids).toEqual(["doc-public"]);
  });
});
