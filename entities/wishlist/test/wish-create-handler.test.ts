import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { CreateInput, CreateInterceptionResult } from "@brains/plugins";
import type { WishlistConfigInput } from "../src";
import { wishlistPlugin } from "./wishlist-plugin";

// Wishes arrive through system_create: every shape reaches the wish's create
// route, which raises the count of a wish asked for again.
describe("wish creation", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  async function install(config: WishlistConfigInput = {}): Promise<void> {
    harness = createPluginHarness({ dataDir: "/tmp/test-wishlist" });
    await harness.installPlugin(wishlistPlugin(config));
  }

  async function create(
    input: Omit<CreateInput, "entityType">,
  ): Promise<CreateInterceptionResult | undefined> {
    return harness.getEntityRegistry().getCreateInterceptor("wish")?.(
      { entityType: "wish", ...input },
      {
        interfaceType: "discord",
        actor: { kind: "user", userId: "yeehaa" },
      },
    );
  }

  async function wishes(): Promise<
    Array<{ id: string; metadata: Record<string, unknown> }>
  > {
    return harness.getEntityService().listEntities({
      entityType: "wish",
      options: {},
    });
  }

  beforeEach(async () => {
    await install();
  });

  it("should not expose any tools (all moved to system)", () => {
    const capabilities = harness.getCapabilities();
    expect(capabilities.tools).toHaveLength(0);
  });

  it("should create a new wish", async () => {
    const result = await create({
      title: "Send emails",
      content: "User wants email integration",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "created" } },
    });
    const stored = await wishes();
    expect(stored.length).toBe(1);
    expect(stored[0]?.metadata["title"]).toBe("Send emails");
    expect(stored[0]?.metadata["status"]).toBe("new");
    expect(stored[0]?.metadata["requested"]).toBe(1);
  });

  it("should default priority to medium", async () => {
    await create({
      title: "Water my plants",
      content: "User wants plant watering",
    });

    expect((await wishes())[0]?.metadata["priority"]).toBe("medium");
  });

  it("should use prompt as title fallback", async () => {
    await create({ prompt: "I want to send emails" });

    expect((await wishes())[0]?.metadata["title"]).toBe(
      "I want to send emails",
    );
  });

  it("should intercept system_create for wish and populate required metadata", async () => {
    const result = await create({
      title: "Make lasagna",
      content: "User wants the assistant to physically make lasagna.",
    });

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "make-lasagna", status: "created" },
      },
    });

    const wish = await harness.getEntityService().getEntity({
      entityType: "wish",
      id: "make-lasagna",
    });
    expect(wish?.metadata["title"]).toBe("Make lasagna");
    expect(wish?.metadata["status"]).toBe("new");
    expect(wish?.metadata["priority"]).toBe("medium");
    expect(wish?.metadata["requested"]).toBe(1);
    expect(wish?.metadata["slug"]).toBe("make-lasagna");
  });

  it("refuses a wish that is not public", async () => {
    expect(
      await create({
        title: "Private wish",
        content: "Only for me",
        visibility: "shared",
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error:
          "Wish creation currently supports public visibility only; use a note for shared or restricted capture.",
      },
    });
  });

  it("raises the count of a wish asked for again by its title", async () => {
    await create({ title: "Send emails", content: "First ask" });

    const again = await create({ title: "Send emails", content: "Again" });

    expect(again).toMatchObject({
      result: {
        success: true,
        data: { entityId: "send-emails", status: "updated" },
      },
    });
    const stored = await wishes();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.metadata["requested"]).toBe(2);
  });

  it("counts a reworded wish within the configured distance", async () => {
    const shell = harness.getMockShell();
    spyOn(shell, "generateObject").mockResolvedValue({
      object: { same: true },
    });
    spyOn(harness.getEntityService(), "searchWithDistances").mockResolvedValue([
      { entityId: "water-my-plants", entityType: "wish", distance: 0.35 },
    ]);
    await create({
      title: "Water my plants",
      content: "User wants plants watered",
    });

    const strict = await create({
      title: "Garden watering",
      content: "User wants the garden watered",
    });
    await install({ sameWishDistance: 0.4 });
    spyOn(harness.getMockShell(), "generateObject").mockResolvedValue({
      object: { same: true },
    });
    spyOn(harness.getEntityService(), "searchWithDistances").mockResolvedValue([
      { entityId: "water-my-plants", entityType: "wish", distance: 0.35 },
    ]);
    await create({
      title: "Water my plants",
      content: "User wants plants watered",
    });
    const loose = await create({
      title: "Houseplant care",
      content: "User wants houseplants watered",
    });

    expect(strict).toMatchObject({
      result: { data: { entityId: "garden-watering", status: "created" } },
    });
    expect(loose).toMatchObject({
      result: { data: { entityId: "water-my-plants", status: "updated" } },
    });
  });
});
