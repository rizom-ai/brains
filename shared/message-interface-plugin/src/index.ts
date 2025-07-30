// Base classes
export { MessageInterfacePlugin } from "./base/message-interface-plugin";

// Types
export type {
  CommandResponse,
  BatchOperationResponse,
  JobResponse,
  MessageResponse,
  IMessageInterfacePlugin,
} from "./base/types";

// Schemas
export {
  commandResponseSchema,
  batchOperationResponseSchema,
  jobResponseSchema,
  messageResponseSchema,
} from "./base/types";

// Utilities
export {
  setupProgressHandler,
  extractJobContext,
} from "./utils/progress-handler";

// Test utilities
export { MessageInterfacePluginTestHarness } from "./test-harness";
