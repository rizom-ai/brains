import { describe, expect, it, mock } from "bun:test";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import { createLinkedInImportTools } from "../src/tools";

const toolContext: ToolContext = {
  interfaceType: "test",
  userId: "anchor",
};

describe("LinkedIn import tools", () => {
  it("queues an anchor-only write job", async () => {
    const enqueue = mock(async () => "linkedin-job-1");
    const tools = createLinkedInImportTools("linkedin-import", {
      jobs: { enqueue } as unknown as ServicePluginContext["jobs"],
    });
    const tool = tools[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const result = await tool.handler({}, toolContext);

    expect(tool.name).toBe("linkedin-import_import");
    expect(tool.visibility).toBe("anchor");
    expect(tool.sideEffects).toBe("writes");
    expect(enqueue).toHaveBeenCalledWith({
      type: "linkedin-import",
      data: {},
    });
    expect(result).toEqual({
      success: true,
      data: { jobId: "linkedin-job-1", status: "queued" },
    });
  });

  it("rejects unexpected input", async () => {
    const tools = createLinkedInImportTools("linkedin-import", {
      jobs: {
        enqueue: mock(async () => "unused"),
      } as unknown as ServicePluginContext["jobs"],
    });
    const tool = tools[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const result = await tool.handler({ force: true }, toolContext);

    expect(result).toMatchObject({ success: false });
  });
});
