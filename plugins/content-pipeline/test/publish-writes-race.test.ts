import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import { PublicationQueueService } from "../src/publication-queue-service";
import { markEntityPublished } from "../src/publish-state-updater";
import { QueueManager } from "../src/queue-manager";

type Context = ReturnType<typeof createServicePluginContext>;

async function createFixture(): Promise<Context> {
  const context = createServicePluginContext(
    createMockShell(),
    "content-pipeline",
  );
  context.entities.register(
    "social-post",
    baseEntitySchema,
    createTestEntityAdapter("social-post"),
  );
  await context.entityService.createEntity({
    entity: {
      id: "first",
      entityType: "social-post",
      content: "---\ntitle: First post\nstatus: draft\n---\n\nFirst version",
      metadata: { title: "First post", status: "draft" },
    },
  });
  return context;
}

const stored = async (context: Context): Promise<string> =>
  (
    await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    })
  )?.content ?? "";

/** Another writer edits the post just before the next update is applied. */
function editBeforeNextUpdate(context: Context): void {
  const update = context.entityService.updateEntity.bind(context.entityService);
  let raced = false;
  context.entityService.updateEntity = async (
    request,
  ): ReturnType<typeof update> => {
    if (!raced) {
      raced = true;
      const current = await context.entityService.getEntity({
        entityType: "social-post",
        id: "first",
      });
      if (!current) throw new Error("No post to edit");
      await update({
        entity: {
          ...current,
          content: current.content.replace("First version", "Edited in Studio"),
        },
      });
    }
    return update(request);
  };
}

describe("publish bookkeeping over an entity that changed meanwhile", () => {
  it("records a completed publish on the current version, keeping the edit", async () => {
    const context = await createFixture();
    const read = await context.entityService.getEntity({
      entityType: "social-post",
      id: "first",
    });
    if (!read) throw new Error("No post");
    // The provider publishes; meanwhile the post is edited.
    editBeforeNextUpdate(context);

    const written = await markEntityPublished(
      context,
      read,
      { id: "platform-1" },
      { publishedAt: "2026-11-18T12:00:00.000Z" },
    );

    const content = await stored(context);
    expect(content).toContain("Edited in Studio");
    expect(content).toContain("status: published");
    expect(written.content).toContain("Edited in Studio");
    expect(written.metadata).toMatchObject({
      status: "published",
      platformId: "platform-1",
    });
  });

  it("marks a failed publish on the current version, keeping the edit", async () => {
    const context = await createFixture();
    const service = new PublicationQueueService(
      context,
      QueueManager.createFresh(),
    );
    editBeforeNextUpdate(context);

    await service.fail("social-post", "first", "Provider refused");

    const content = await stored(context);
    expect(content).toContain("Edited in Studio");
    expect(content).toContain("status: failed");
  });
});
