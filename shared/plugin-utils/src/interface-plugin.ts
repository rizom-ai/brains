import type {
  PluginContext,
  PluginTool,
  PluginResource,
  Daemon,
  IInterfacePlugin,
} from "./interfaces";
import { BasePlugin } from "./base-plugin";
import type { Command } from "@brains/command-registry";

/**
 * Base implementation of InterfacePlugin that provides daemon registration
 * Extends BasePlugin and implements the InterfacePlugin interface
 */
export abstract class InterfacePlugin<TConfig = unknown>
  extends BasePlugin<TConfig>
  implements IInterfacePlugin
{
  protected isStarted = false;
  public readonly type = "interface" as const;

  /**
   * Override onRegister to register daemon
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    // Create daemon wrapper for the interface
    const daemon: Daemon = {
      start: async () => {
        await this.start();
        this.isStarted = true;
        this.logger.info(`${this.id} interface started`);
      },
      stop: async () => {
        await this.stop();
        this.isStarted = false;
        this.logger.info(`${this.id} interface stopped`);
      },
      healthCheck: async () => {
        return {
          status: this.isStarted ? ("healthy" as const) : ("error" as const),
          message: this.isStarted
            ? `${this.id} interface is running`
            : `${this.id} interface is not started`,
          lastCheck: new Date(),
          details: {
            interfaceId: this.id,
            isStarted: this.isStarted,
          },
        };
      },
    };

    // Register the daemon
    context.registerDaemon(`${this.id}-daemon`, daemon);
  }

  /**
   * Interfaces don't provide tools by default
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return [];
  }

  /**
   * Interfaces don't provide resources by default
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  /**
   * Interfaces don't provide commands by default
   */
  protected override async getCommands(): Promise<Command[]> {
    return [];
  }

  /**
   * Start the interface
   * Must be implemented by subclasses
   */
  public abstract start(): Promise<void>;

  /**
   * Stop the interface
   * Must be implemented by subclasses
   */
  public abstract stop(): Promise<void>;
}
