import { createWebChatInterface } from "./web-chat-interface";

export {
  createWebChatInterface,
  type WebChatDeps,
  type WebChatInterfaceDefinition,
} from "./web-chat-interface";
export {
  webChatConfigSchema,
  type WebChatConfig,
  type WebChatConfigInput,
} from "./config";

/** Web chat, with the brain's auth backend and the configured guest policy. */
const webChatInterface: ReturnType<typeof createWebChatInterface> =
  createWebChatInterface();

export default webChatInterface;
