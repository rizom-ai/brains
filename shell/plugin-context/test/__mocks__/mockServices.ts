import { mock } from "bun:test";
import { createSilentLogger } from "@brains/utils";
import type { CoreServices } from "../../src/contexts/corePluginContext";

export function createMockCoreServices(): CoreServices {
  return {
    logger: createSilentLogger(),
    commandRegistry: {
      register: mock(() => {}),
    },
    toolRegistry: {
      register: mock(() => {}),
    },
    messageBus: {
      send: mock(() => Promise.resolve({ success: true, results: [] })),
      subscribe: mock(() => () => {}), // returns unsubscribe function
    },
  };
}