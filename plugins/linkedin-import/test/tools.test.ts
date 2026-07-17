import { describe, expect, it, mock } from "bun:test";
import type {
  IEntityService,
  ServicePluginContext,
  ToolContext,
  ToolResponse,
} from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
import { createLinkedInImportTools } from "../src/tools";

const toolContext: ToolContext = {
  interfaceType: "test",
  userId: "anchor",
};

function expectConfirmation(
  result: ToolResponse,
): Extract<ToolResponse, { needsConfirmation: true }> {
  expect(result).toHaveProperty("needsConfirmation", true);
  if (!("needsConfirmation" in result)) {
    throw new Error("Expected LinkedIn import confirmation");
  }
  return result;
}

function createDeps(overrides?: {
  records?: Array<Record<string, unknown>>;
  content?: string;
}): {
  enqueue: ReturnType<typeof mock>;
  deps: Parameters<typeof createLinkedInImportTools>[1];
} {
  const enqueue = mock(async () => "linkedin-job-1");
  const profile = createTestEntity("anchor-profile", {
    id: "anchor-profile",
    content:
      overrides?.content ?? "---\nname: Unknown\nkind: professional\n---\n",
  });
  return {
    enqueue,
    deps: {
      client: {
        fetchProfile: mock(
          async () =>
            overrides?.records ?? [
              { "First Name": "Ada", "Last Name": "Morgan" },
            ],
        ),
      },
      entityService: {
        getEntity: mock(async () => profile),
      } as unknown as IEntityService,
      jobs: { enqueue } as unknown as ServicePluginContext["jobs"],
    },
  };
}

describe("LinkedIn import tools", () => {
  it("previews changes and queues only after typed confirmation", async () => {
    const { enqueue, deps } = createDeps();
    const tools = createLinkedInImportTools("linkedin-import", deps);
    const tool = tools[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const confirmation = expectConfirmation(
      await tool.handler({}, toolContext),
    );

    expect(tool.name).toBe("linkedin-import_import");
    expect(tool.visibility).toBe("anchor");
    expect(tool.sideEffects).toBe("writes");
    expect(confirmation.summary).toBe(
      "Import the previewed LinkedIn profile fields?",
    );
    expect(confirmation.preview).toContain("Fields to add: name");
    expect(enqueue).not.toHaveBeenCalled();

    const result = await tool.handler(confirmation.args, toolContext);

    expect(enqueue).toHaveBeenCalledWith({
      type: "linkedin-import",
      data: {},
    });
    expect(result).toEqual({
      success: true,
      data: { jobId: "linkedin-job-1", status: "queued" },
    });
  });

  it("refuses forged confirmations", async () => {
    const { enqueue, deps } = createDeps();
    const tool = createLinkedInImportTools("linkedin-import", deps)[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const result = await tool.handler(
      { confirmed: true, confirmationToken: "forged" },
      toolContext,
    );

    expect(result).toMatchObject({ success: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns without confirmation when the profile is already current", async () => {
    const { enqueue, deps } = createDeps({
      records: [{ "First Name": "Ada", "Last Name": "Morgan" }],
      content: "---\nname: Ada Morgan\nkind: professional\n---\n",
    });
    const tool = createLinkedInImportTools("linkedin-import", deps)[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const result = await tool.handler({}, toolContext);

    expect(result).toEqual({
      success: true,
      data: {
        status: "up-to-date",
        recordsRead: 1,
        preservedFields: [],
      },
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects unexpected input", async () => {
    const { deps } = createDeps();
    const tool = createLinkedInImportTools("linkedin-import", deps)[0];
    if (!tool) throw new Error("LinkedIn import tool not registered");

    const result = await tool.handler({ force: true }, toolContext);

    expect(result).toMatchObject({ success: false });
  });
});
