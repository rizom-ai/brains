import type { Logger } from "@brains/utils";
import {
  getStandardConfigWithDirectories,
  type StandardConfig,
} from "@brains/core";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";

/**
 * Database configuration with URL and optional auth token
 */
export interface DatabaseConfig {
  url: string;
  authToken?: string;
}

/**
 * Interface for migration functions - enables dependency injection and testing
 */
export interface IMigrationFunctions {
  getStandardConfigWithDirectories(): Promise<StandardConfig>;
  migrateEntities(config: DatabaseConfig, logger?: Logger): Promise<void>;
  migrateJobQueue(config: DatabaseConfig, logger?: Logger): Promise<void>;
  migrateConversations(config: DatabaseConfig, logger?: Logger): Promise<void>;
}

export interface DatabaseUrlOverrides {
  database?: string | undefined;
  jobQueueDatabase?: string | undefined;
  conversationDatabase?: string | undefined;
}

export class MigrationManager {
  private logger: Logger;
  private migrations: IMigrationFunctions;

  constructor(logger: Logger, migrations?: IMigrationFunctions) {
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
   * @param overrides Optional URL overrides for each database
   */
  public async runAllMigrations(
    overrides?: DatabaseUrlOverrides,
  ): Promise<void> {
    this.logger.debug("Running database migrations...");

    const config = await this.migrations.getStandardConfigWithDirectories();

    // Apply URL overrides if provided
    if (overrides?.database) {
      config.database.url = overrides.database;
    }
    if (overrides?.jobQueueDatabase) {
      config.jobQueueDatabase.url = overrides.jobQueueDatabase;
    }
    if (overrides?.conversationDatabase) {
      config.conversationDatabase.url = overrides.conversationDatabase;
    }

    // Run each migration
    await this.migrateEntityDatabase(config);
    await this.migrateJobQueueDatabase(config);
    await this.migrateConversationDatabase(config);

    this.logger.debug("All database migrations completed successfully");
  }

  private async migrateEntityDatabase(config: StandardConfig): Promise<void> {
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

  private async migrateJobQueueDatabase(config: StandardConfig): Promise<void> {
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
    config: StandardConfig,
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
