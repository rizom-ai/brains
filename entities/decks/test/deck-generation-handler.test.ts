import { describe, it, expect, beforeEach } from "bun:test";
import { DeckGenerationJobHandler } from "../src/handlers/deckGenerationJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("DeckGenerationJobHandler", () => {
  let handler: DeckGenerationJobHandler;

  beforeEach(() => {
    const mockContext = createMockServicePluginContext({
      returns: {
        entityService: {
          getEntity: null,
          listEntities: [],
          createEntity: { entityId: "test-id" },
        },
      },
    });

    handler = new DeckGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a presentation", title: "My Deck" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a presentation");
      expect(result?.title).toBe("My Deck");
    });

    it("should accept empty object (all fields optional)", () => {
      const result = handler.validateAndParse({});
      expect(result).not.toBeNull();
    });

    it("should return null for invalid data", () => {
      const result = handler.validateAndParse({ skipAi: "not-a-boolean" });
      expect(result).toBeNull();
    });
  });
});
