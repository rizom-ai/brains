import { mock } from "bun:test";
import type { ServiceServices } from "../../src/contexts/servicePluginContext";
import { createMockCoreServices } from "./mockServices";

export function createMockServiceServices(): ServiceServices {
  const coreServices = createMockCoreServices();

  return {
    ...coreServices,
    entityService: {
      createEntity: mock(() =>
        Promise.resolve({
          id: "calc-123",
          entityType: "calculation",
          expression: "2+2",
          result: "4",
        }),
      ),
      getEntity: mock(() => Promise.resolve(null)),
      updateEntity: mock(() => Promise.resolve({ id: "calc-123" })),
      deleteEntity: mock(() => Promise.resolve()),
      listEntities: mock(() =>
        Promise.resolve({
          entities: [
            {
              id: "1",
              expression: "2+2",
              result: "4",
              timestamp: "2024-01-01",
            },
            {
              id: "2",
              expression: "3*3",
              result: "9",
              timestamp: "2024-01-02",
            },
          ],
          total: 2,
        }),
      ),
      searchEntities: mock(() => Promise.resolve({ entities: [], total: 0 })),
    },
    entityRegistry: {
      registerEntityType: mock(() => {}),
    },
    shell: {
      generateContent: mock(() =>
        Promise.resolve(
          "Addition is the process of combining two or more numbers.",
        ),
      ),
      registerRoutes: mock(() => {}),
    },
    jobQueueService: {
      enqueue: mock(() => Promise.resolve("job-123")),
      getStatus: mock(() => Promise.resolve(null)),
      getActiveJobs: mock(() => Promise.resolve([])),
      registerHandler: mock(() => {}),
    },
    batchJobManager: {
      enqueueBatch: mock(() => Promise.resolve("batch-456")),
      getBatchStatus: mock(() => Promise.resolve(null)),
      getActiveBatches: mock(() => Promise.resolve([])),
    },
    viewRegistry: {
      getViewTemplate: mock(() => undefined),
      getRoute: mock(() => undefined),
      listRoutes: mock(() => []),
      listViewTemplates: mock(() => []),
    },
  };
}
