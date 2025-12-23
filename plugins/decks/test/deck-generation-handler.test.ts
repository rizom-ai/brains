import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DeckGenerationJobHandler } from "../src/handlers/deckGenerationJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";

describe("DeckGenerationJobHandler", () => {
  let handler: DeckGenerationJobHandler;
  let mockContext: ServicePluginContext;

  beforeEach(() => {
    mockContext = {
      generateContent: mock(() => Promise.resolve({})),
      entityService: {
        getEntity: mock(() => Promise.resolve(null)),
        listEntities: mock(() => Promise.resolve([])),
        createEntity: mock(() =>
          Promise.resolve({ entityId: "test-id", entity: {} }),
        ),
        updateEntity: mock(() => Promise.resolve({ entityId: "", entity: {} })),
        deleteEntity: mock(() => Promise.resolve({})),
      },
    } as unknown as ServicePluginContext;

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
