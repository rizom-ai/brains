import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  MigrationManager,
  type MigrationFunctions,
} from "../src/migration-manager";
import type { Logger } from "@brains/utils";

describe("MigrationManager", () => {
  let mockLogger: Logger;
  let mockMigrations: MigrationFunctions;
  let migrationManager: MigrationManager;
  const mockConfig = {
    database: {
      url: "file:test.db",
      authToken: "test-token",
    },
    jobQueueDatabase: {
      url: "file:job-queue.db",
      authToken: "job-token",
    },
    conversationDatabase: {
      url: "file:conversation.db",
      authToken: "conv-token",
    },
    embedding: {
      cacheDir: "/test/cache/embeddings",
    },
  };

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    } as unknown as Logger;

    mockMigrations = {
      getStandardConfigWithDirectories: mock(() => Promise.resolve(mockConfig)),
      migrateEntities: mock(() => Promise.resolve()),
      migrateJobQueue: mock(() => Promise.resolve()),
      migrateConversations: mock(() => Promise.resolve()),
    } as unknown as MigrationFunctions;

    migrationManager = new MigrationManager(mockLogger, mockMigrations);
  });

  describe("runAllMigrations", () => {
    it("should run all migrations successfully", async () => {
      await migrationManager.runAllMigrations();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Running database migrations...",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Running entity database migrations...",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Running job queue database migrations...",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Running conversation database migrations...",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "✅ All database migrations completed successfully",
      );

      expect(mockMigrations.migrateEntities).toHaveBeenCalledWith(
        {
          url: mockConfig.database.url,
          authToken: mockConfig.database.authToken,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateJobQueue).toHaveBeenCalledWith(
        {
          url: mockConfig.jobQueueDatabase.url,
          authToken: mockConfig.jobQueueDatabase.authToken,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateConversations).toHaveBeenCalledWith(
        {
          url: mockConfig.conversationDatabase.url,
          authToken: mockConfig.conversationDatabase.authToken,
        },
        mockLogger,
      );
    });

    it("should handle migration failures gracefully", async () => {
      const migrationError = new Error("Migration failed");
      mockMigrations.getStandardConfigWithDirectories = mock(() =>
        Promise.reject(migrationError),
      );

      await migrationManager.runAllMigrations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Migration failed (databases may already be migrated):",
        migrationError,
      );
    });

    it("should work without auth tokens", async () => {
      const configWithoutTokens = {
        database: {
          url: "file:test.db",
          authToken: undefined,
        },
        jobQueueDatabase: {
          url: "file:job-queue.db",
          authToken: undefined,
        },
        conversationDatabase: {
          url: "file:conversation.db",
          authToken: undefined,
        },
        embedding: {
          cacheDir: "/test/cache/embeddings",
        },
      };

      mockMigrations.getStandardConfigWithDirectories = mock(() =>
        Promise.resolve(configWithoutTokens),
      );

      await migrationManager.runAllMigrations();

      expect(mockMigrations.migrateEntities).toHaveBeenCalledWith(
        {
          url: configWithoutTokens.database.url,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateJobQueue).toHaveBeenCalledWith(
        {
          url: configWithoutTokens.jobQueueDatabase.url,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateConversations).toHaveBeenCalledWith(
        {
          url: configWithoutTokens.conversationDatabase.url,
        },
        mockLogger,
      );
    });

    it("should continue if one migration fails", async () => {
      mockMigrations.migrateEntities = mock(() =>
        Promise.reject(new Error("Entity migration failed")),
      );

      await migrationManager.runAllMigrations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Migration failed (databases may already be migrated):",
        expect.any(Error),
      );
    });
  });
});
