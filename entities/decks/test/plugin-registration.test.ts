import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import { SYSTEM_CHANNELS, type EvalHandler } from "@brains/plugins";
import { createTestEntity } from "@brains/entity-service/test";
import { DecksPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("DecksPlugin - Publish Pipeline Integration", () => {
  let harness: PluginTestHarness<DecksPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<DecksPlugin>({ dataDir: "/tmp/test-decks" });
    receivedMessages = [];

    for (const eventType of [publishRegisterContract.name]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("generation evals", () => {
    it("passes voice guidance to description evals without injecting identity", async () => {
      let descriptionHandler: EvalHandler | undefined;
      const mockShell = harness.getMockShell();
      mockShell.registerEvalHandler = (_pluginId, handlerId, handler): void => {
        if (handlerId === "generateDescription") descriptionHandler = handler;
      };
      spyOn(mockShell.getEntityService(), "getEntity").mockResolvedValue(
        createTestEntity("style-guide", {
          id: "style-guide",
          content:
            "---\nname: Voice\nvoice:\n  summary: Decisive and evidence-led\n---\n",
          metadata: {},
        }),
      );
      const generateContent = spyOn(
        mockShell,
        "generateContent",
      ).mockResolvedValue({ description: "Source-matched description" });

      await harness.installPlugin(new DecksPlugin());
      if (!descriptionHandler) {
        throw new Error("Deck description eval handler was not registered");
      }
      await descriptionHandler({
        title: "Existing Deck",
        content: "Opinionated presentation content",
      });

      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "decks:description",
          representedIdentity: "none",
          styleGuide: {
            voice: expect.stringContaining("Decisive and evidence-led"),
          },
        }),
        undefined,
      );
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(new DecksPlugin());

      expect(
        receivedMessages.find((m) => m.type === publishRegisterContract.name),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === publishRegisterContract.name,
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "deck",
        provider: { name: "internal" },
      });
    });
  });
});
