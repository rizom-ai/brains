import { describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createTestEntity } from "@brains/entity-service/test";
import { installTopics } from "./topics-plugins";

describe("topic projection ownership migration", () => {
  it.each([false, true])(
    "releases old ownership without deleting existing topics (enabled=%s)",
    async (enabled) => {
      const harness = createPluginHarness({
        logContext: "topics-migration",
      });
      const service = harness.getEntityService();
      for (const visibility of ["public", "shared", "restricted"] as const) {
        await service.createEntity({
          entity: createTestEntity("topic", {
            id: `kept-${visibility}`,
            content: "# Kept\n\nExisting description.",
            visibility,
          }),
        });
      }
      const release = spyOn(service, "releaseProjectionOwnership");
      const remove = spyOn(service, "deleteEntity");
      const capabilities = await installTopics(harness, {
        enableAutoExtraction: enabled,
      });
      expect(capabilities.projectionRules).toBeUndefined();
      expect(release).toHaveBeenCalledTimes(3);
      for (const visibility of ["public", "shared", "restricted"] as const) {
        expect(release).toHaveBeenCalledWith({
          entityType: "topic",
          id: `kept-${visibility}`,
        });
        expect(
          await service.getEntity({
            entityType: "topic",
            id: `kept-${visibility}`,
            visibilityScope: "restricted",
          }),
        ).not.toBeNull();
      }
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("releases old ownership once per brain, not on every boot", async () => {
    const harness = createPluginHarness({
      logContext: "topics-migration",
    });
    const service = harness.getEntityService();
    await service.createEntity({
      entity: createTestEntity("topic", {
        id: "kept",
        content: "# Kept\n\nExisting description.",
        visibility: "public",
      }),
    });
    const release = spyOn(service, "releaseProjectionOwnership");
    await installTopics(harness, { enableAutoExtraction: false });
    // A reboot starts with an empty bus and registry; only the brain's state
    // carries over.
    harness.getMockShell().getMessageBus().clearAllHandlers();
    harness.getEntityRegistry().unregisterEntityType("topic");
    await installTopics(harness, { enableAutoExtraction: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on a fresh brain, and runs no more after it", async () => {
    const harness = createPluginHarness({
      logContext: "topics-migration",
    });
    const service = harness.getEntityService();
    const release = spyOn(service, "releaseProjectionOwnership");
    await installTopics(harness, { enableAutoExtraction: false });
    expect(release).not.toHaveBeenCalled();
    // A topic written after the first boot is never the retired rule's.
    await service.createEntity({
      entity: createTestEntity("topic", {
        id: "new",
        content: "---\ntitle: New\n---\nA new topic.",
        visibility: "public",
      }),
    });
    harness.getMockShell().getMessageBus().clearAllHandlers();
    harness.getEntityRegistry().unregisterEntityType("topic");
    await installTopics(harness, { enableAutoExtraction: false });
    expect(release).not.toHaveBeenCalled();
  });
});
