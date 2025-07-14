import type { Plugin, PluginContext, PluginCapabilities } from "./interfaces";

/**
 * Plugin lifecycle events
 */
export type PluginLifecycleEvent =
  | "beforeRegister"
  | "afterRegister"
  | "beforeShutdown"
  | "afterShutdown";

/**
 * Plugin lifecycle hook
 */
export type PluginLifecycleHook = (
  plugin: Plugin,
  context?: PluginContext,
) => Promise<void> | void;

/**
 * Decorator to add lifecycle hooks to a plugin
 */
export class PluginWithLifecycle implements Plugin {
  private hooks: Map<PluginLifecycleEvent, PluginLifecycleHook[]> = new Map();

  constructor(private plugin: Plugin) {
    // Copy plugin properties
    this.id = plugin.id;
    this.version = plugin.version;
    this.packageName = plugin.packageName;
    this.description = plugin.description ?? "";
  }

  // Plugin properties
  id: string;
  version: string;
  packageName: string;
  description: string;

  /**
   * Add a lifecycle hook
   */
  on(event: PluginLifecycleEvent, hook: PluginLifecycleHook): this {
    const hooks = this.hooks.get(event) ?? [];
    hooks.push(hook);
    this.hooks.set(event, hooks);
    return this;
  }

  /**
   * Register with lifecycle hooks
   */
  async register(context: PluginContext): Promise<PluginCapabilities> {
    // Run beforeRegister hooks
    await this.runHooks("beforeRegister", context);

    // Register the plugin
    const capabilities = await this.plugin.register(context);

    // Run afterRegister hooks
    await this.runHooks("afterRegister", context);

    return capabilities;
  }

  /**
   * Shutdown with lifecycle hooks
   */
  async shutdown?(): Promise<void> {
    const pluginWithShutdown = this.plugin as Plugin & {
      shutdown?: () => Promise<void>;
    };
    if (!pluginWithShutdown.shutdown) return;

    // Run beforeShutdown hooks
    await this.runHooks("beforeShutdown");

    // Shutdown the plugin
    await pluginWithShutdown.shutdown();

    // Run afterShutdown hooks
    await this.runHooks("afterShutdown");
  }

  /**
   * Run hooks for an event
   */
  private async runHooks(
    event: PluginLifecycleEvent,
    context?: PluginContext,
  ): Promise<void> {
    const hooks = this.hooks.get(event) ?? [];
    for (const hook of hooks) {
      await hook(this.plugin, context);
    }
  }
}

/**
 * Add lifecycle hooks to a plugin
 */
export function withLifecycle(plugin: Plugin): PluginWithLifecycle {
  return new PluginWithLifecycle(plugin);
}

/**
 * Helper to retry plugin operations with exponential backoff
 */
export async function retryPluginOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    onRetry,
  } = options;

  let lastError: Error = new Error("No attempts made");
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Wait with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Helper to ensure a plugin is properly initialized
 */
export function requiresInitialization<T extends Plugin>(
  plugin: T,
  isInitialized: () => boolean,
  methodName: string,
): T {
  const handler = {
    get(target: T, prop: string): unknown {
      const value = target[prop as keyof T];

      // Only wrap methods that need initialization
      if (prop === methodName && typeof value === "function") {
        return function (this: unknown, ...args: unknown[]): unknown {
          if (!isInitialized()) {
            throw new Error(
              `Plugin ${plugin.id} method ${methodName} called before initialization`,
            );
          }
          return (value as (...args: unknown[]) => unknown).apply(target, args);
        };
      }

      return value;
    },
  };

  return new Proxy(plugin, handler) as T;
}

/**
 * Create a plugin that delegates to another plugin
 * Useful for creating plugin wrappers or adapters
 */
export function delegatePlugin(
  delegate: Plugin,
  overrides: Partial<Plugin> = {},
): Plugin {
  return {
    id: overrides.id ?? delegate.id,
    version: overrides.version ?? delegate.version,
    packageName: overrides.packageName ?? delegate.packageName,
    description: overrides.description ?? delegate.description,
    register: overrides.register ?? delegate.register.bind(delegate),
  };
}

/**
 * Compose multiple plugins into a single plugin
 */
export function composePlugins(
  id: string,
  packageName: string,
  description: string,
  plugins: Plugin[],
): Plugin {
  return {
    id,
    version: "1.0.0",
    packageName,
    description,
    async register(context: PluginContext): Promise<PluginCapabilities> {
      const allCapabilities = await Promise.all(
        plugins.map((p) => p.register(context)),
      );

      // Merge capabilities
      const tools = allCapabilities.flatMap((c) => c.tools);
      const resources = allCapabilities.flatMap((c) => c.resources);
      const commands = allCapabilities.flatMap((c) => c.commands);

      return { tools, resources, commands };
    },
  };
}
