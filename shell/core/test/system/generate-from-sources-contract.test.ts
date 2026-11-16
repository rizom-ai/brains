import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { generateFromSourcesContract } from "@brains/contracts";
import type { BaseEntity, EntityTypeConfig } from "@brains/entity-service";
import { createMockMCPService } from "@brains/mcp-service/test";
import { MessageBus } from "@brains/messaging-service";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { registerSystemCapabilities } from "../../src/system/register";
import { createMockSystemServices } from "./mock-services";

/**
 * A package without the agent's tools, such as Studio, asks for a
 * generation written from existing entries through this contract. It is
 * answered by system_generate itself, as the caller named in the request,
 * so the refusals, the confirmation and the queued job are the tool's.
 */

const note = (id: string, title: string): BaseEntity => ({
  id,
  entityType: "note",
  content: `About ${title}`,
  contentHash: id,
  visibility: "public",
  metadata: { title },
  created: "2026-11-15T00:00:00.000Z",
  updated: "2026-11-15T00:00:00.000Z",
});

const reply = z.object({
  success: z.literal(true),
  data: generateFromSourcesContract.response,
});

describe("the generate-from-sources contract", () => {
  let messageBus: MessageBus;
  let services: ReturnType<typeof createMockSystemServices>;
  let unsubscribe: () => void;

  function start(permissions = new PermissionService({})): void {
    const logger = createSilentLogger("generate-from-sources");
    messageBus = MessageBus.createFresh(logger);
    services = createMockSystemServices({ permissionService: permissions });
    services.registerEntityTypes(["note", "refined-note"]);
    services.addEntities([
      note("loose-thought", "Loose thought"),
      note("second-thought", "Second thought"),
    ]);
    services.entityRegistry.getEntityTypeConfig = (
      type: string,
    ): EntityTypeConfig =>
      type === "refined-note" ? { consumesSources: ["note"] } : {};
    unsubscribe = registerSystemCapabilities(
      services,
      createMockMCPService(),
      messageBus,
      logger,
    );
  }

  beforeEach(() => start());
  afterEach(() => unsubscribe());

  async function ask(
    request: Record<string, unknown>,
    userPermissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<z.output<typeof generateFromSourcesContract.response>> {
    const response = await messageBus.send({
      type: generateFromSourcesContract.name,
      payload: {
        entityType: "refined-note",
        source: {
          entityType: "note",
          entityIds: ["loose-thought", "second-thought"],
        },
        actor: { kind: "user", userId: "tester" },
        interfaceType: "studio",
        userPermissionLevel,
        ...request,
      },
      sender: "studio",
    });
    return reply.parse(response).data;
  }

  it("answers an unapproved request with the tool's confirmation", async () => {
    const answer = await ask({});

    expect(answer).toMatchObject({
      status: "confirm",
      summary:
        'Generate refined-note from "Loose thought" and "Second thought"? They will be removed.',
      preview: expect.stringContaining("Removes: note/second-thought"),
    });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("queues the generation once the approval is sent back", async () => {
    const asked = await ask({ prompt: "Focus on the budget" });
    if (asked.status !== "confirm") throw new Error("No confirmation");

    const answer = await ask({ approval: asked.approval });

    expect(answer).toMatchObject({
      status: "queued",
      entityId: expect.any(String),
    });
    const job = services.getLastEnqueuedJob();
    expect(job?.type).toBe("refined-note:generation");
    expect(job?.data).toMatchObject({
      prompt: "Focus on the budget",
      sourceEntityType: "note",
      sourceEntityIds: ["loose-thought", "second-thought"],
    });
  });

  it("refuses an approval the tool did not give", async () => {
    const asked = await ask({});
    if (asked.status !== "confirm") throw new Error("No confirmation");

    const answer = await ask({
      approval: { ...asked.approval, confirmationToken: "made-up" },
    });

    expect(answer).toMatchObject({ status: "refused" });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("refuses an approval for another generation than the one asked for", async () => {
    const answer = await ask({
      approval: {
        operation: {
          kind: "prompt",
          entityType: "note",
          prompt: "Something else entirely",
        },
        confirmed: true,
        confirmationToken: "any",
      },
    });

    expect(answer).toEqual({
      status: "refused",
      error: "The approval is not for this generation.",
    });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("answers the tool's refusal as the caller named in the request", async () => {
    unsubscribe();
    start(
      new PermissionService({ entityActions: { note: { delete: "admin" } } }),
    );

    expect(await ask({}, "trusted")).toEqual({
      status: "refused",
      error:
        "Deleting `note` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("carries the tool's code for an entry that is not there", async () => {
    expect(
      await ask({ source: { entityType: "note", entityIds: ["nowhere"] } }),
    ).toMatchObject({ status: "refused", code: "source-not-found" });
  });
});
