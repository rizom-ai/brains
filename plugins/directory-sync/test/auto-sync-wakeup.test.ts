import { describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { setupAutoSync } from "../src/lib/auto-sync";

describe("auto-sync export wake-up", () => {
  it.each(["entity:created", "entity:updated", "entity:deleted"])(
    "wakes the export when the worker reports %s",
    async (channel) => {
      const shell = createMockShell();
      let wakeups = 0;
      setupAutoSync(
        createServicePluginContext(shell, "directory-sync"),
        () => {
          wakeups += 1;
        },
        createSilentLogger(),
        [],
      );

      await shell
        .getMessageBus()
        .deliverPeer(channel, { entityType: "note", entityId: "note-1" });

      expect(wakeups).toBe(1);
    },
  );
});
