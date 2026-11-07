import type { IRuntimeStateNamespace } from "@brains/plugins";
import type { Adapter } from "chat";
import type { WhatsAppChatAdapterConfig } from "./config";

/**
 * The contract between the chat interface and the WhatsApp modules.
 *
 * Type-only, so the interface can name it without loading Baileys: the
 * WhatsApp modules are imported dynamically, and only when a brain configures
 * `adapters.whatsapp`.
 */
export type WhatsAppConnectionStatus =
  "stopped" | "connecting" | "awaiting-pairing" | "connected" | "logged-out";

export interface WhatsAppLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

export interface WhatsAppRuntimeOptions {
  config: WhatsAppChatAdapterConfig;
  userName: string;
  runtimeState: IRuntimeStateNamespace;
  restartDelayMs: number;
  logger: WhatsAppLogger;
}

export interface WhatsAppConnection {
  start(): void;
  stop(): Promise<void>;
  isRunning(): boolean;
  status(): WhatsAppConnectionStatus;
}

export interface WhatsAppRuntime {
  adapter: Adapter;
  loop: WhatsAppConnection;
}

export type CreateWhatsAppRuntime = (
  options: WhatsAppRuntimeOptions,
) => Promise<WhatsAppRuntime>;
