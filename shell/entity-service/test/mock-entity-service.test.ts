import { describe, it, expect } from "bun:test";
import { createMockEntityService } from "../src/test";

describe("createMockEntityService", () => {
  it("should create a mock entity service", () => {
    const service = createMockEntityService();
    expect(service).toBeDefined();
    expect(typeof service.getEntity).toBe("function");
    expect(typeof service.createEntity).toBe("function");
  });

  it("should return configured entity types", () => {
    const service = createMockEntityService({
      entityTypes: ["note", "post"],
    });
    expect(service.getEntityTypes()).toEqual(["note", "post"]);
  });
});
