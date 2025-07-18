import { mock } from "bun:test";
import type { InterfaceServices } from "../../src/contexts/interfacePluginContext";
import { createMockCoreServices } from "./mockServices";

export function createMockInterfaceServices(): InterfaceServices {
  const coreServices = createMockCoreServices();

  return {
    ...coreServices,
    shell: {
      generateContent: mock(() =>
        Promise.resolve({
          message: "This is a response to your query.",
          summary: "Query response",
          topics: ["test", "example"],
          sources: [
            { id: "doc-1", type: "note", excerpt: "Test note", relevance: 0.9 },
          ],
          metadata: {},
        }),
      ),
    },
    commandRegistry: {
      getAllCommands: mock(() => [
        {
          name: "test:command",
          description: "Test command",
          handler: () => "Test",
        },
        { name: "help", description: "Show help", handler: () => "Help" },
      ]),
    },
    daemonRegistry: {
      register: mock(() => {}),
    },
    jobQueueService: {
      getActiveJobs: mock(() =>
        Promise.resolve([
          { id: "job-1", type: "test-job", status: "processing" },
          { id: "job-2", type: "test-job", status: "pending" },
        ]),
      ),
    },
    batchJobManager: {
      getActiveBatches: mock(() =>
        Promise.resolve([
          { id: "batch-1", status: "processing", jobIds: ["job-1", "job-2"] },
        ]),
      ),
    },
  };
}
