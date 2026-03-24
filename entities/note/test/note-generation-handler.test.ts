import { describe, it, expect, beforeEach } from "bun:test";
import { NoteGenerationJobHandler } from "../src/handlers/noteGenerationJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("NoteGenerationJobHandler", () => {
  let handler: NoteGenerationJobHandler;

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

    handler = new NoteGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a note about TypeScript" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a note about TypeScript");
    });

    it("should accept optional title", () => {
      const data = { prompt: "Create a note", title: "My Note" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.title).toBe("My Note");
    });

    it("should return null for missing required prompt", () => {
      const result = handler.validateAndParse({});
      expect(result).toBeNull();
    });
  });
});
