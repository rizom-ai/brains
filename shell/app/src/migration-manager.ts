import type { Logger } from "@brains/utils";
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue";
import { migrateConversations } from "@brains/conversation-service";

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

  public async runAllMigrations(): Promise<void> {
    this.logger.info("Running database migrations...");

    try {
      const config = await this.migrations.getStandardConfigWithDirectories();

      await this.migrateEntityDatabase(config);
      await this.migrateJobQueueDatabase(config);
      await this.migrateConversationDatabase(config);

      this.logger.info("✅ All database migrations completed successfully");
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
    this.logger.info("Running entity database migrations...");
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
    this.logger.info("Running job queue database migrations...");
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
    this.logger.info("Running conversation database migrations...");
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
