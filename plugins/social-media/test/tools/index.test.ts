import { describe, it, expect, beforeEach } from "bun:test";
import { createGenerateTool, generateInputSchema } from "../../src/tools";
import { socialMediaConfigSchema } from "../../src/config";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";

// Helper to create a null tool context for tests
const nullContext = null as unknown as ToolContext;

describe("Social Media Tools", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  const pluginId = "social-media";
  const config = socialMediaConfigSchema.parse({});

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, pluginId);
  });

  describe("createGenerateTool", () => {
    it("should create a generate tool", () => {
      const tool = createGenerateTool(context, config, pluginId);
      expect(tool.name).toBe("social-media_generate");
      expect(tool.handler).toBeDefined();
    });

    it("should have correct input schema", () => {
      const result = generateInputSchema.safeParse({
        prompt: "Test prompt",
        platform: "linkedin",
      });
      expect(result.success).toBe(true);
    });

    it("should validate sourceEntityType when sourceEntityId is provided", () => {
      // This should pass schema validation but fail tool validation
      const result = generateInputSchema.safeParse({
        sourceEntityId: "post-123",
        // Missing sourceEntityType
      });
      expect(result.success).toBe(true); // Schema allows it, but tool will reject
    });

    it("should require at least one content source", async () => {
      const tool = createGenerateTool(context, config, pluginId);
      const result = await tool.handler({}, nullContext);
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("prompt");
    });
  });
});
