import { mock } from "bun:test";
import { createSilentLogger } from "@brains/utils";
import type { CoreServices } from "../../src/contexts/corePluginContext";

export function createMockCoreServices(): CoreServices {
  return {
    logger: createSilentLogger(),
    messageBus: {
      send: mock(() => Promise.resolve({ success: true, results: [] })),
      subscribe: mock(() => () => {}), // returns unsubscribe function
      unsubscribe: mock(() => {}),
    },
    contentGenerator: {
      generateContent: mock(() => Promise.resolve({})),
      formatContent: mock(() => "formatted content"),
      parseContent: mock(() => ({})),
      registerTemplate: mock(() => {}),
      getTemplate: mock(() => null),
      listTemplates: mock(() => []),
      generateWithRoute: mock(() => Promise.resolve("generated")),
    },
  };
}
