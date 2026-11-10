import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";

describe("system_job_status tool", () => {
  let tools: Tool[];

  beforeEach(() => {
    const services = createMockSystemServices();
    tools = createSystemTools(services);
  });

  function findTool(name: string): Tool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  it("tells agents to inspect runtime status for ready checks and status disputes", () => {
    const tool = findTool("system_job_status");

    expect(tool.description).toContain("ready checks");
    expect(tool.description).toContain(
      "only when the prior operation created a job",
    );
    expect(tool.description).toContain("status disputes");
    expect(tool.description).toContain("runtime job status");
    expect(tool.description).toContain(
      "Do not argue from the transcript alone",
    );
  });

  it("declares public read-only metadata", () => {
    const tool = findTool("system_job_status");

    expect(tool.visibility).toBe("public");
    expect(tool.sideEffects).toBe("none");
  });

  describe("batch errors", () => {
    const rawError = "SQLITE_BUSY: database is locked at /data/brain.db";
    const batchStatus = {
      batchId: "batch-1",
      totalOperations: 2,
      completedOperations: 1,
      failedOperations: 1,
      errors: [rawError],
      status: "failed" as const,
    };

    function jobStatusTool(): Tool {
      const services = createMockSystemServices();
      services.jobs.getBatchStatus = async (): Promise<typeof batchStatus> =>
        batchStatus;
      services.jobs.getActiveBatches = async (): Promise<
        Awaited<ReturnType<typeof services.jobs.getActiveBatches>>
      > => [
        {
          batchId: "batch-1",
          status: batchStatus,
          metadata: {
            operations: [],
            source: "test",
            startedAt: "2026-11-07T00:00:00.000Z",
            metadata: {
              operationType: "batch_processing",
              rootJobId: "batch-1",
              pluginId: "directory-sync",
            },
          },
        },
      ];
      const tool = createSystemTools(services).find(
        (candidate) => candidate.name === "system_job_status",
      );
      if (!tool) throw new Error("system_job_status not found");
      return tool;
    }

    const batchData = z.object({
      batchId: z.string(),
      progress: z.object({ failed: z.number() }),
      errors: z.array(z.string()).optional(),
    });
    const listData = z.object({
      batches: z.array(
        z.object({
          batchId: z.string(),
          failedOperations: z.number(),
          errors: z.array(z.string()).optional(),
        }),
      ),
    });

    async function run(
      input: { batchId?: string },
      userPermissionLevel?: "public" | "trusted" | "admin",
    ): Promise<unknown> {
      const result = await jobStatusTool().handler(input, {
        interfaceType: "test",
        actor: { kind: "user", userId: "test" },
        ...(userPermissionLevel && { userPermissionLevel }),
      });
      expect(result).toMatchObject({ success: true });
      return "data" in result ? result.data : undefined;
    }

    it.each([
      ["a public caller", "public" as const],
      ["a caller with no permission level", undefined],
    ])("keeps raw batch errors from %s", async (_label, level) => {
      const batch = batchData.parse(await run({ batchId: "batch-1" }, level));
      expect(batch.progress.failed).toBe(1);
      expect(batch.errors).toBeUndefined();

      const list = listData.parse(await run({}, level));
      expect(list.batches[0]?.failedOperations).toBe(1);
      expect(list.batches[0]?.errors).toBeUndefined();
    });

    it.each([["trusted" as const], ["admin" as const]])(
      "shows raw batch errors to a %s caller",
      async (level) => {
        const batch = batchData.parse(await run({ batchId: "batch-1" }, level));
        expect(batch.errors).toEqual([rawError]);

        const list = listData.parse(await run({}, level));
        expect(list.batches[0]?.errors).toEqual([rawError]);
      },
    );
  });
});
