import { describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

describe("system_set-cover migration", () => {
  it("does not register the legacy system_set-cover tool", () => {
    const tools = createSystemTools(createMockSystemServices());

    expect(tools.map((tool) => tool.name)).not.toContain("system_set-cover");
  });
});
