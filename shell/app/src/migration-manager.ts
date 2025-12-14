import type { Logger } from "@brains/utils";
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";

export interface MigrationFunctions {
  getStandardConfigWithDirectories: typeof getStandardConfigWithDirectories;
  migrateEntities: typeof migrateEntities;
  migrateJobQueue: typeof migrateJobQueue;
  migrateConversations: typeof migrateConversations;
}

export class MigrationManager {
  private logger: Logger;
  private migrations: MigrationFunctions;

  constructor(logger: Logger, migrations?: MigrationFunctions) {
    this.logger = logger;
    this.migrations = migrations ?? {
      getStandardConfigWithDirectories,
      migrateEntities,
      migrateJobQueue,
      migrateConversations,
    };
  }

  /**
   * Run all database migrations
   * @param databaseUrlOverride Optional URL to use for all databases (useful for evals/testing)
   */
  public async runAllMigrations(databaseUrlOverride?: string): Promise<void> {
    this.logger.debug("Running database migrations...");

    try {
      const config = await this.migrations.getStandardConfigWithDirectories();

      // Apply URL override to all databases if provided
      if (databaseUrlOverride) {
        config.database.url = databaseUrlOverride;
        config.jobQueueDatabase.url = databaseUrlOverride;
        config.conversationDatabase.url = databaseUrlOverride;
      }

      await this.migrateEntityDatabase(config);
      await this.migrateJobQueueDatabase(config);
      await this.migrateConversationDatabase(config);

      this.logger.debug("All database migrations completed successfully");
    } catch (error) {
      this.logger.warn(
        "Migration failed (databases may already be migrated):",
        error,
      );
    }
  }

  private async migrateEntityDatabase(
    config: Awaited<ReturnType<typeof getStandardConfigWithDirectories>>,
  ): Promise<void> {
    this.logger.debug("Running entity database migrations...");
    await this.migrations.migrateEntities(
      {
        url: config.database.url,
        ...(config.database.authToken && {
          authToken: config.database.authToken,
        }),
      },
      this.logger,
    );
  }

  private async migrateJobQueueDatabase(
    config: Awaited<ReturnType<typeof getStandardConfigWithDirectories>>,
  ): Promise<void> {
    this.logger.debug("Running job queue database migrations...");
    await this.migrations.migrateJobQueue(
      {
        url: config.jobQueueDatabase.url,
        ...(config.jobQueueDatabase.authToken && {
          authToken: config.jobQueueDatabase.authToken,
        }),
      },
      this.logger,
    );
  }

  private async migrateConversationDatabase(
    config: Awaited<ReturnType<typeof getStandardConfigWithDirectories>>,
  ): Promise<void> {
    this.logger.debug("Running conversation database migrations...");
    await this.migrations.migrateConversations(
      {
        url: config.conversationDatabase.url,
        ...(config.conversationDatabase.authToken && {
          authToken: config.conversationDatabase.authToken,
        }),
      },
      this.logger,
    );
  }
}
