import { describe, expect, it } from "bun:test";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createEntityDeleteTool } from "../../src/system/entity-delete-tool";
import { createEntityReadTools } from "../../src/system/entity-read-tools";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

describe("system tool side-effect metadata", () => {
  it("marks entity read tools as side-effect free", () => {
    const tools = createEntityReadTools(createMockSystemServices());

    expect(
      Object.fromEntries(tools.map((tool) => [tool.name, tool.sideEffects])),
    ).toMatchObject({
      system_get: "none",
      system_list: "none",
      system_search: "none",
    });
  });

  it("marks entity mutation tools as writes", () => {
    const services = createMockSystemServices();
    const tools = [
      createEntityCreateTool(services),
      createEntityUpdateTool(services),
      createEntityDeleteTool(services),
    ];

    expect(
      Object.fromEntries(tools.map((tool) => [tool.name, tool.sideEffects])),
    ).toMatchObject({
      system_create: "writes",
      system_update: "writes",
      system_delete: "writes",
    });
  });
});
