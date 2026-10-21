import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { SYSTEM_CHANNELS, type EvalHandler } from "@brains/plugins";
import { createTestEntity } from "@brains/entity-service/test";
import { styleGuideAdapter, type StyleGuideEntity } from "@brains/style-guide";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("SocialMediaPlugin - Publish Pipeline Registration", () => {
  let harness: PluginTestHarness<SocialMediaPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social",
    });
    receivedMessages = [];

    harness.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
  });

  describe("generation evals", () => {
    it("generates eval posts in the anchor's voice from the style guide", async () => {
      let generationHandler: EvalHandler | undefined;
      const mockShell = harness.getMockShell();
      mockShell.registerEvalHandler = (_pluginId, handlerId, handler): void => {
        if (handlerId === "generation") generationHandler = handler;
      };
      spyOn(mockShell.getEntityService(), "getEntity").mockResolvedValue(
        createTestEntity<StyleGuideEntity>("style-guide", {
          id: "style-guide",
          content: styleGuideAdapter.createStyleGuideContent({
            name: "Voice",
            voice: { summary: "Full paragraphs, no engagement bait" },
          }),
          metadata: {},
        }),
      );
      const generateContent = spyOn(
        mockShell,
        "generateContent",
      ).mockResolvedValue({ content: "Post" });

      await harness.installPlugin(new SocialMediaPlugin({}));
      if (!generationHandler) {
        throw new Error("Social generation eval handler was not registered");
      }
      await generationHandler({ prompt: "Write about resilient systems" });

      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "social-media:linkedin",
          representedIdentity: "anchor",
          styleGuide: {
            voice: expect.stringContaining(
              "Full paragraphs, no engagement bait",
            ),
          },
        }),
        undefined,
      );
    });
  });

  describe("entity policy registration", () => {
    it("declares social-post publish statuses and secondary topic authority", async () => {
      await harness.installPlugin(new SocialMediaPlugin({}));

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("social-post"),
      ).toMatchObject({
        projectionSourceRole: "secondary",
        publish: { publishStatuses: ["queued", "published", "failed"] },
      });
    });

    it("registers auto-generation only as a scheduler-owned rule", async () => {
      const capabilities = await harness.installPlugin(
        new SocialMediaPlugin({ autoGenerateOnBlogPublish: true }),
      );

      expect("projections" in capabilities).toBe(false);
      expect(capabilities.projectionRules).toHaveLength(1);
      expect(capabilities.projectionRules?.[0]).toMatchObject({
        id: "social-post-generation",
        targetType: "social-post",
        sources: [{ kind: "entity", types: ["post"] }],
      });
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with linkedin provider", async () => {
      await harness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );

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
        entityType: "social-post",
      });
      expect(registerMessage?.payload).toHaveProperty(
        "provider.name",
        "linkedin",
      );
      expect(registerMessage?.payload).toMatchObject({
        config: { publishResultIdField: "platformPostId" },
      });
    });

    it("should not send publish:register if no providers configured", async () => {
      await harness.installPlugin(new SocialMediaPlugin({}));

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeUndefined();
    });
  });

  describe("publish:execute subscription", () => {
    it("should subscribe to publish:execute messages", async () => {
      await harness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );

      // Sending triggers the handler — verify it ran via side effects
      harness.subscribe("publish:report:failure", async (msg) => {
        receivedMessages.push({
          type: "publish:report:failure",
          payload: msg.payload,
        });
        return { success: true };
      });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "non-existent",
      });

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });
  });
});
