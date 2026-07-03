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
    expect(instructions).toContain("Owner/anchor-only entity removal");
    expect(instructions).toContain("deletion requires owner access");
    expect(instructions).toContain("system_get");
    expect(instructions).toContain("system_list");
    expect(instructions).toContain("system_search");
    expect(instructions).toContain("run a fresh search for that turn");
    expect(instructions).toContain(
      "Never pass `confirmed: true` on the initial user request",
    );
  });

  it("should tell agents to use system_update for field changes", () => {
    const services = createMockSystemServices();
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("Use `fields` for title, status");
    expect(instructions).toContain("system_update");
  });

  it("describes source-derived artifacts with the canonical source attachment branch", () => {
    const services = createMockSystemServices();
    const instructions = createSystemInstructions(services);

    expect(instructions).toContain(
      'Required `source` union: `{ kind: "text", content }`',
    );
    expect(instructions).toContain('`{ kind: "prior-response", messageId? }`');
    expect(instructions).toContain('`{ kind: "prompt", entityType, prompt }`');
    expect(instructions).toContain(
      '`{ kind: "prompt-from-source", entityType, source: { entityType, entityId }, prompt }`',
    );
    expect(instructions).toContain(
      '`{ kind: "attachment", source: { entityType, entityId }, attachmentType }`',
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

  it("does not advertise entity types that are not registered", () => {
    const services = createMockSystemServices();
    services.registerEntityTypes(["note"]);

    const instructions = createSystemInstructions(services);

    // The blog plugin is not installed, so "post" must never be offered as a
    // selectable entity type — otherwise the model generates an unregistered type.
    expect(instructions).toContain("- note:");
    expect(instructions).not.toContain("- post:");
    expect(instructions).not.toContain("- deck:");
  });

  it("lists each registered entity type by its declared purpose, not example phrasings", () => {
    const services = createMockSystemServices();
    services.registerEntityTypes(["note", "post"]);

    const instructions = createSystemInstructions(services);

    expect(instructions).toContain("- note:");
    expect(instructions).toContain("- post:");
    expect(instructions).not.toContain("- deck:");
    // Types are described by their declarative purpose (from the adapter),
    // not by hardcoded "phrase → entityType" routing examples.
    expect(instructions).toContain("Test entity for unit tests.");
    expect(instructions).not.toContain("→ entityType:");
  });
});
