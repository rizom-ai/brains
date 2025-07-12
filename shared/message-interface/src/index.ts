// Base classes
export { MessageInterfacePlugin } from "./base/message-interface-plugin";

// Types
export type {
  Command,
  CommandResponse,
  BatchOperationResponse,
  MessageContext,
  IMessageInterfacePlugin,
} from "./base/types";

// Schemas
export {
  commandResponseSchema,
  batchOperationResponseSchema,
} from "./base/types";

// Utilities
export { getBaseCommands } from "./commands/base-commands";
export {
  getTestCommands,
  registerTestJobHandlers,
} from "./commands/test-commands";
export {
  setupProgressHandler,
  extractProgressEventContext,
} from "./utils/progress-handler";
