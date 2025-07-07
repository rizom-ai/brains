import { describe, test, expect, mock } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import type { Job } from "@brains/types";
import type { BatchJobStatus } from "@brains/job-queue";

describe("CLI Progress Integration", () => {
  test("should expose job tracking methods", async () => {
    const cli = new CLIInterface();
    
    // Mock the context with job tracking methods
    const mockContext = {
      getActiveJobs: mock(async () => [] as Job[]),
      getActiveBatches: mock(async () => []),
      getBatchStatus: mock(async (batchId: string) => null as BatchJobStatus | null),
    };
    
    // Set the mock context
    (cli as any).context = mockContext;
    
    // Test getActiveJobs
    const jobs = await cli.getActiveJobs();
    expect(mockContext.getActiveJobs).toHaveBeenCalled();
    expect(jobs).toEqual([]);
    
    // Test getActiveBatches
    const batches = await cli.getActiveBatches();
    expect(mockContext.getActiveBatches).toHaveBeenCalled();
    expect(batches).toEqual([]);
    
    // Test getBatchStatus
    const status = await cli.getBatchStatus("test-batch-id");
    expect(mockContext.getBatchStatus).toHaveBeenCalledWith("test-batch-id");
    expect(status).toBeNull();
  });

  test("should throw error when context is not initialized", async () => {
    const cli = new CLIInterface();
    
    // Ensure context is null
    (cli as any).context = null;
    
    // Test that methods throw appropriate errors
    await expect(cli.getActiveJobs()).rejects.toThrow("Plugin context not initialized");
    await expect(cli.getActiveBatches()).rejects.toThrow("Plugin context not initialized");
    await expect(cli.getBatchStatus("test")).rejects.toThrow("Plugin context not initialized");
  });

  test("should include test-progress command in help", () => {
    const cli = new CLIInterface();
    const helpText = (cli as any).getHelpText();
    
    expect(helpText).toContain("/test-progress");
    expect(helpText).toContain("Test progress tracking with a slow job");
  });
});