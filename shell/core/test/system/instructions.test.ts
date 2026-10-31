import { describe, expect, it } from "bun:test";
import { createSystemInstructions } from "../../src/system/instructions";
import { createMockSystemServices } from "./mock-services";

describe("system instructions", () => {
  it("keeps the cross-tool entity rules", () => {
    const instructions = createSystemInstructions(createMockSystemServices());

    expect(instructions).toContain("approve/archive an agent");
    expect(instructions).toContain(
      "proactively recording the user's request itself",
    );
    expect(instructions).toContain(
      "even when the user did not use a separate save/create verb",
    );
    expect(instructions).toContain(
      "Never call system_create for a status follow-up",
    );
    expect(instructions).toContain(
      "Never pass `confirmed: true` on the initial user request",
    );
    expect(instructions).toContain(
      "Do not ask for prose confirmation instead of calling the applicable mutating tool",
    );
    expect(instructions).toContain("deletion requires Admin access");
    expect(instructions).toContain("never say saved/created/done");
    expect(instructions).toContain(
      "do not call system_status or system_search to check permission",
    );
    expect(instructions).toContain(
      "projection-owned or system-maintained types read-only",
    );
    expect(instructions).toContain("without calling read or write tools");
  });

  // Every agent step resends the whole prompt, and each tool's description
  // already reaches the model with the tool — and only when the caller can
  // use it. Restating a tool's contract here doubled it on every step.
  it("leaves each tool's contract to its description", () => {
    const instructions = createSystemInstructions(createMockSystemServices());

    for (const tool of [
      "system_create",
      "system_generate",
      "system_update",
      "system_delete",
      "system_get",
      "system_list",
      "system_search",
    ]) {
      expect(instructions).not.toContain(`- **${tool}**`);
    }
    expect(instructions).not.toContain("Required `source` union");
    expect(instructions).not.toContain("Required `operation` union");
    expect(instructions).not.toContain("Available entity types:");
  });

  it("stays a short preamble to the entity type list", () => {
    const instructions = createSystemInstructions(createMockSystemServices());

    expect(instructions.length).toBeLessThan(3_000);
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
