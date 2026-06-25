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
    expect(instructions).toContain(
      "Never pass `confirmed: true` on the initial user request",
    );
  });

  it("should tell agents to use system_update for field changes", () => {
    const services = createMockSystemServices();
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("Use `fields` for title, status");
    expect(instructions).toContain("call `system_update`");
  });

  it("describes source-derived artifacts with sourceAttachment, not from", () => {
    const services = createMockSystemServices();
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("`sourceAttachment`");
    expect(instructions).toContain("source-derived artifact saves");
    expect(instructions).toContain(
      "Use `from` only for prior assistant response saves",
    );
    expect(instructions).not.toContain(
      "`from` for source-derived artifact saves",
    );
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

  it("does not advertise example entity types that are not registered", () => {
    const services = createMockSystemServices();
    services.registerEntityTypes(["note"]);

    const instructions = createSystemInstructions(services);

    // The blog plugin is not installed, so "post" must never be offered as a
    // mappable entity type — otherwise the model generates an unregistered type.
    expect(instructions).not.toContain('entityType: "post"');
    expect(instructions).not.toContain('entityType: "deck"');
    expect(instructions).toContain('entityType: "note"');
  });

  it("advertises example mappings only for registered entity types", () => {
    const services = createMockSystemServices();
    services.registerEntityTypes(["note", "post"]);

    const instructions = createSystemInstructions(services);

    expect(instructions).toContain('entityType: "post"');
    expect(instructions).toContain('entityType: "note"');
    expect(instructions).not.toContain('entityType: "deck"');
  });
});
