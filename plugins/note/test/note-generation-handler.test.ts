import { describe, it, expect, beforeEach, mock } from "bun:test";
import { NoteGenerationJobHandler } from "../src/handlers/noteGenerationJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";

describe("NoteGenerationJobHandler", () => {
  let handler: NoteGenerationJobHandler;
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
