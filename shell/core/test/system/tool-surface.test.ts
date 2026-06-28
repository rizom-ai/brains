import { describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

describe("system tool surface", () => {
  it("does not expose raw conversation history inspection tools to agents", () => {
    const tools = createSystemTools(createMockSystemServices());
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).not.toContain("system_get-conversation");
    expect(toolNames).not.toContain("system_list-conversations");
    expect(toolNames).not.toContain("system_get-messages");
  });
});
