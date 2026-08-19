import { describe, it, expect, beforeEach } from "bun:test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import wishlistPackage from "../src";
import packageJson from "../package.json";

/**
 * These behaviours used to be asserted against WishCreateHandler, which the
 * plugin ran inline from interceptCreate. They belong to the entity's create
 * route: it returns what should be written, and the runtime writes it and
 * reports whether that was a create or an update.
 */
describe("the wish create route", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  function entityPlugin(): Plugin {
    const metadata = { name: packageJson.name, version: packageJson.version };
    bindPluginPackageMetadata(wishlistPackage, metadata);
    const plugin = instantiatePluginPackageDefinition(
      wishlistPackage,
      {},
      metadata,
    )[0];
    if (!plugin) throw new Error("Wish entity plugin was not created");
    return plugin;
  }

  async function route(input: Record<string, unknown>): Promise<unknown> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("wish");
    if (!interceptor) throw new Error("Create interceptor was not registered");
    return interceptor(
      { entityType: "wish", ...input } as never,
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "tester" },
      } as never,
    );
  }

  beforeEach(async () => {
    harness = createPluginHarness({
      logger: createSilentLogger("wishlist-create-test"),
      dataDir: "/tmp/test-wishlist",
    });
    await harness.installPlugin(entityPlugin());
  });

  it("creates a wish and says so", async () => {
    const result = await route({
      title: "Make lasagna",
      content: "User wants the assistant to physically make lasagna.",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "make-lasagna", status: "created" },
      },
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "wish", id: "make-lasagna" });
    expect(stored?.metadata).toMatchObject({
      title: "Make lasagna",
      status: "new",
      priority: "medium",
      requested: 1,
    });
  });

  it("falls back to the prompt when no title is given", async () => {
    await route({ prompt: "I want to send emails" });

    const wishes = await harness
      .getEntityService()
      .listEntities({ entityType: "wish", options: {} });
    expect(wishes[0]?.metadata["title"]).toBe("I want to send emails");
  });

  // Asking twice is demand, not a second wish.
  it("raises the count on a wish that already exists", async () => {
    await route({ title: "Make lasagna", content: "Please cook." });
    const second = await route({
      title: "Make lasagna",
      content: "Please cook.",
    });

    expect(second).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "make-lasagna", status: "updated" },
      },
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "wish", id: "make-lasagna" });
    expect(stored?.metadata["requested"]).toBe(2);
    expect(
      await harness
        .getEntityService()
        .listEntities({ entityType: "wish", options: {} }),
    ).toHaveLength(1);
  });

  it("refuses anything but public visibility", async () => {
    expect(
      await route({
        title: "Private wish",
        prompt: "Keep this one to myself",
        visibility: "restricted",
      }),
    ).toMatchObject({
      kind: "handled",
      result: { success: false, error: expect.stringContaining("public") },
    });
  });

  it("exposes no tools — wishes are created through system_create", async () => {
    expect(harness.getCapabilities().tools).toHaveLength(0);
  });
});
