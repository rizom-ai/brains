import { describe, it, expect, beforeEach } from "bun:test";
import { DirectorySyncJobHandler } from "../../src/handlers/directorySyncJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectorySyncJobHandler", () => {
  let handler: DirectorySyncJobHandler;

  beforeEach(() => {
    handler = new DirectorySyncJobHandler(
      createSilentLogger("test"),
      createMockServicePluginContext(),
      createMockDirectorySync(),
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { operation: "manual" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("manual");
    });

    it("should accept optional fields", () => {
      const data = {
        operation: "initial",
        paths: ["/path/to/dir"],
        syncDirection: "import",
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("initial");
      expect(result?.paths).toEqual(["/path/to/dir"]);
      expect(result?.syncDirection).toBe("import");
    });

    it("should return null for invalid operation", () => {
      const result = handler.validateAndParse({ operation: "invalid" });
      expect(result).toBeNull();
    });

    it("should clean up undefined optional properties", () => {
      const data = { operation: "scheduled" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      // Should not have undefined properties
      expect(Object.keys(result as object)).toEqual(["operation"]);
    });
  });
});
