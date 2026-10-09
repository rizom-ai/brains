import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/sdk/services";
import { installTopics, TOPIC_JOB } from "./helpers/install";

describe("ranked topic extraction triggers", () => {
  it.each([false, true])(
    "enqueues independent, deduplicated maintenance in both roles (worker=%s)",
    async (worker) => {
      const { harness, enqueue, capabilities, registerHandler } =
        await installTopics({
          worker,
          config: { includeEntityTypes: ["post"] },
        });
      try {
        expect(
          capabilities.every((value) => !value.projectionRules?.length),
        ).toBe(true);
        expect(registerHandler).toHaveBeenCalledWith(
          TOPIC_JOB,
          expect.anything(),
          "@brains/topics:topics",
        );
        for (const type of [
          "entity:created",
          "entity:updated",
          "entity:deleted",
        ]) {
          await harness.sendMessage(
            type,
            { entityType: "post", entityId: "post-1" },
            "entity-service",
          );
        }
        expect(enqueue).toHaveBeenCalledTimes(3);
        const roots = new Set<string>();
        for (const [request] of enqueue.mock.calls) {
          expect(request).toMatchObject({
            type: TOPIC_JOB,
            options: {
              source: "@brains/topics:topics",
              deduplication: "skip",
              deduplicationKey: "extract",
              rootJobId: expect.any(String),
              delayMs: 1000,
            },
          });
          if (request.options?.rootJobId) roots.add(request.options.rootJobId);
        }
        expect(roots.size).toBe(3);
        for (const entityType of ["topic", "note", "skill", "unregistered"])
          await harness.sendMessage(
            "entity:updated",
            { entityType },
            "entity-service",
          );
        await harness.sendMessage(
          "entity:updated",
          { invalid: true },
          "entity-service",
        );
        expect(enqueue).toHaveBeenCalledTimes(3);
      } finally {
        await harness.reset();
      }
    },
  );

  it("heals on startup-content-settled, not ready or failed/legacy import events", async () => {
    const { harness, enqueue } = await installTopics();
    try {
      for (const payload of [{ success: true }, { success: false }, {}])
        await harness.sendMessage(
          "sync:initial:completed",
          payload,
          "directory-sync",
        );
      await harness.sendMessage(SYSTEM_CHANNELS.shellReady, {}, "shell");
      expect(enqueue).not.toHaveBeenCalled();
      await harness.sendMessage(
        SYSTEM_CHANNELS.startupContentSettled,
        {},
        "shell",
      );
      expect(enqueue).toHaveBeenCalledTimes(1);
    } finally {
      await harness.reset();
    }
  });

  it("does not enqueue when disabled; the installed handler can safely drain old work", async () => {
    const { harness, enqueue, registerHandler } = await installTopics({
      config: { enableAutoExtraction: false },
    });
    try {
      await harness.sendMessage(
        "entity:updated",
        { entityType: "post" },
        "entity-service",
      );
      await harness.sendMessage(
        SYSTEM_CHANNELS.startupContentSettled,
        {},
        "shell",
      );
      expect(registerHandler).toHaveBeenCalledWith(
        TOPIC_JOB,
        expect.anything(),
        "@brains/topics:topics",
      );
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await harness.reset();
    }
  });
});
