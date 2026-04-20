import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { WishlistPlugin } from "../src";
import { WishCreateHandler } from "../src/handlers/wish-create-handler";
import type { EntityPluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";

const noopProgress = {} as ProgressReporter;

describe("WishCreateHandler", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: WishCreateHandler;
  let context: EntityPluginContext;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-wishlist" });
    await harness.installPlugin(new WishlistPlugin({}));
    context = harness.getEntityContext("wishlist");
    handler = new WishCreateHandler(
      {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      } as never,
      context,
    );
  });

  it("should not expose any tools (all moved to system)", () => {
    const capabilities = harness.getCapabilities();
    expect(capabilities.tools).toHaveLength(0);
  });

  it("should create a new wish", async () => {
    const result = await handler.process(
      { title: "Send emails", content: "User wants email integration" },
      "job-1",
      noopProgress,
    );

    expect(result.success).toBe(true);
    expect(result.existed).toBe(false);
    expect(result.requested).toBe(1);

    const wishes = await context.entityService.listEntities("wish", {});
    expect(wishes.length).toBe(1);
    expect(wishes[0]?.metadata["title"]).toBe("Send emails");
    expect(wishes[0]?.metadata["status"]).toBe("new");
  });

  it("should default priority to medium", async () => {
    await handler.process(
      { title: "Water my plants", content: "User wants plant watering" },
      "job-2",
      noopProgress,
    );

    const wishes = await context.entityService.listEntities("wish", {});
    expect(wishes[0]?.metadata["priority"]).toBe("medium");
  });

  it("should accept priority via options", async () => {
    await handler.process(
      {
        title: "Water my plants",
        content: "User wants plant watering",
        options: { priority: "high" },
      },
      "job-3",
      noopProgress,
    );

    const wishes = await context.entityService.listEntities("wish", {});
    expect(wishes[0]?.metadata["priority"]).toBe("high");
  });

  it("should use prompt as title fallback", async () => {
    await handler.process(
      { prompt: "I want to send emails" },
      "job-5",
      noopProgress,
    );

    const wishes = await context.entityService.listEntities("wish", {});
    expect(wishes[0]?.metadata["title"]).toBe("I want to send emails");
  });

  it("should intercept system_create for wish and populate required metadata", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("wish");
    expect(interceptor).toBeDefined();

    const result = await interceptor?.(
      {
        entityType: "wish",
        title: "Make lasagna",
        content: "User wants the assistant to physically make lasagna.",
      },
      { interfaceType: "discord", userId: "yeehaa" },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "make-lasagna", status: "created" },
      },
    });

    const wish = await context.entityService.getEntity("wish", "make-lasagna");
    expect(wish?.metadata["title"]).toBe("Make lasagna");
    expect(wish?.metadata["status"]).toBe("new");
    expect(wish?.metadata["priority"]).toBe("medium");
    expect(wish?.metadata["requested"]).toBe(1);
    expect(wish?.metadata["slug"]).toBe("make-lasagna");
  });
});
