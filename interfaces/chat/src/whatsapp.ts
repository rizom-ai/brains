import { WhatsAppAdapter } from "./whatsapp-adapter";
import { WhatsAppConnectionLoop } from "./whatsapp-connection-loop";
import { createWhatsAppSessionStore } from "./whatsapp-session";
import type {
  WhatsAppRuntime,
  WhatsAppRuntimeOptions,
} from "./whatsapp-runtime";

/**
 * The chat interface imports this module dynamically, and only for a brain
 * that configures `adapters.whatsapp`, so other brains never load Baileys.
 */
export function createWhatsApp(
  options: WhatsAppRuntimeOptions,
): WhatsAppRuntime {
  const adapter = new WhatsAppAdapter({ userName: options.userName });
  const loop = new WhatsAppConnectionLoop({
    phoneNumber: options.config.phoneNumber,
    session: createWhatsAppSessionStore(options.runtimeState),
    adapter,
    restartDelayMs: options.restartDelayMs,
    logger: options.logger,
  });
  return { adapter, loop };
}
