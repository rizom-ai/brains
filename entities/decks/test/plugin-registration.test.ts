import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { SYSTEM_CHANNELS, type EvalHandler } from "@brains/plugins";
import { deckEntityPlugin } from "./helpers/install";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("DecksPlugin - Publish Pipeline Integration", () => {
  let harness: PluginTestHarness;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-decks" });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("generation evals", () => {
    it("keeps source-style-preserving description evals neutral", async () => {
      let descriptionHandler: EvalHandler | undefined;
      const mockShell = harness.getMockShell();
      mockShell.registerEvalHandler = (_pluginId, handlerId, handler): void => {
        if (handlerId === "generateDescription") descriptionHandler = handler;
      };
      const generateContent = spyOn(
        mockShell,
        "generateContent",
      ).mockResolvedValue({ description: "Source-matched description" });

      await harness.installPlugin(deckEntityPlugin());
      if (!descriptionHandler) {
        throw new Error("Deck description eval handler was not registered");
      }
      await descriptionHandler({
        title: "Existing Deck",
        content: "Opinionated presentation content",
      });

      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "@brains/decks:deck:description",
          representedIdentity: "none",
        }),
      );
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(deckEntityPlugin());

      expect(
        receivedMessages.find((m) => m.type === "publish:register"),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "deck",
        provider: { name: "internal" },
      });
    });
  });
});
