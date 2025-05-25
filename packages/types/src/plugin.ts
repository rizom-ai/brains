import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { Registry } from "./registry";
import type { MessageBus } from "./messaging";

/**
 * Plugin interface
 * Defines the structure of plugins in the system
 */
export interface Plugin {
  id: string;
  version: string;
  name?: string;
  description?: string;
  dependencies?: string[];
  register(context: PluginContext): void;
}

/**
 * Plugin context passed to plugins during registration
 * Provides access to the registry and other shared services
 */
export interface PluginContext {
  registry: Registry;
  logger: Logger;
  getPlugin: (id: string) => Plugin | undefined;
  events: EventEmitter;
  messageBus: MessageBus;
}