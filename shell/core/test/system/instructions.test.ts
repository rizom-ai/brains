import { describe, expect, it } from "bun:test";
import { createSystemInstructions } from "../../src/system/instructions";
import { createMockSystemServices } from "./mock-services";

describe("system instructions", () => {
  it("should include entity CRUD guidance", () => {
    const services = createMockSystemServices();
    services.addEntities([
      {
        id: "p1",
        entityType: "post",
        content: "",
        contentHash: "",
        metadata: {},
        created: "",
        updated: "",
      },
    ]);
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("system_create");
    expect(instructions).toContain("system_update");
    expect(instructions).toContain("system_delete");
    expect(instructions).toContain("system_get");
    expect(instructions).toContain("system_list");
    expect(instructions).toContain("system_search");
  });

  it("should tell agents to use system_update for field changes", () => {
    const services = createMockSystemServices();
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("Use `fields` for title, status");
    expect(instructions).toContain("call `system_update`");
  });

  it("should list available entity types", () => {
    const services = createMockSystemServices();
    services.addEntities([
      {
        id: "p1",
        entityType: "post",
        content: "",
        contentHash: "",
        metadata: {},
        created: "",
        updated: "",
      },
      {
        id: "n1",
        entityType: "note",
        content: "",
        contentHash: "",
        metadata: {},
        created: "",
        updated: "",
      },
    ]);
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("post");
    expect(instructions).toContain("note");
  });
});
