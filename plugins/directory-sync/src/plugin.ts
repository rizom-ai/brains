import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { DirectorySync } from "./lib/directory-sync";
import { directorySyncConfigSchema, type DirectorySyncConfig } from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import { registerDirectorySyncJobHandlers } from "./lib/register-job-handlers";
import { setupAutoSync, setupFileWatcher } from "./lib/auto-sync";
import { setupInitialSync } from "./lib/initial-sync";
import { registerMessageHandlers } from "./lib/message-handlers";
import { createDirectorySyncTools } from "./tools";
import "./types/job-augmentation";
import packageJson from "../package.json";

export class DirectorySyncPlugin extends ServicePlugin<DirectorySyncConfig> {
  private directorySync?: DirectorySync;

  constructor(config: Partial<DirectorySyncConfig> = {}) {
    super("directory-sync", packageJson, config, directorySyncConfigSchema);
  }

  private requireDirectorySync(): DirectorySync {
    if (!this.directorySync) {
      throw new Error("DirectorySync service not initialized");
    }
    return this.directorySync;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const { logger, entityService } = context;

    context.templates.register({
      status: {
        name: "status",
        description: "Directory synchronization status",
        schema: directorySyncStatusSchema,
        basePrompt: "",
        formatter: new DirectorySyncStatusFormatter(),
        requiredPermission: "anchor",
      },
    });

    const syncPath = this.config.syncPath ?? context.dataDir;
    this.directorySync = new DirectorySync({
      syncPath,
      autoSync: this.config.autoSync,
      watchInterval: this.config.watchInterval,
      includeMetadata: this.config.includeMetadata,
      entityTypes: this.config.entityTypes,
      deleteOnFileRemoval: this.config.deleteOnFileRemoval,
      entityService,
      logger,
    });

    try {
      await this.directorySync.initializeDirectory();
      this.logger.debug("Directory structure initialized", {
        path: syncPath,
      });
    } catch (error) {
      this.logger.error("Failed to initialize directory", error);
      throw error;
    }

    await this.registerJobHandlers(context);

    if (this.config.autoSync) {
      const ds = this.requireDirectorySync();
      setupAutoSync(context, ds, this.logger, this.config.entityTypes);
      setupFileWatcher(context, ds, this.config.syncPath ?? context.dataDir);
    }

    if (this.config.initialSync) {
      setupInitialSync(
        context,
        () => this.requireDirectorySync(),
        this.config,
        this.id,
        this.logger,
      );
    }

    registerMessageHandlers(
      context,
      () => this.requireDirectorySync(),
      (options) => this.configure(options),
      this.logger,
    );
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const directorySync = this.requireDirectorySync();
    return createDirectorySyncTools(directorySync, this.getContext(), this.id);
  }

  protected override async onShutdown(): Promise<void> {
    this.directorySync?.stopWatching();
  }

  public getDirectorySync(): DirectorySync | undefined {
    return this.directorySync;
  }

  public async configure(options: { syncPath: string }): Promise<void> {
    this.requireDirectorySync();
    const context = this.getContext();
    this.directorySync = new DirectorySync({
      ...this.config,
      syncPath: options.syncPath,
      entityService: context.entityService,
      logger: context.logger,
    });

    await this.directorySync.initialize();
    this.logger.info("Directory sync reconfigured", { path: options.syncPath });
  }

  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    registerDirectorySyncJobHandlers(
      context,
      this.requireDirectorySync(),
      this.logger,
    );
  }
}

export function directorySync(
  config: Partial<DirectorySyncConfig> = {},
): Plugin {
  return new DirectorySyncPlugin(config);
}

export const directorySyncPlugin = directorySync;
