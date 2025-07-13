// Base classes
export { MessageInterfacePlugin } from "./base/message-interface-plugin";

// Types
export type {
  Command,
  CommandResponse,
  BatchOperationResponse,
  JobResponse,
  MessageResponse,
  MessageContext,
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
export { getBaseCommands } from "./commands/base-commands";
export {
  getTestCommands,
  registerTestJobHandlers,
} from "./commands/test-commands";
export {
  setupProgressHandler,
  extractJobContext,
} from "./utils/progress-handler";
