import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  MigrationManager,
  type IMigrationFunctions,
} from "../src/migration-manager";
import { createMockLogger } from "@brains/test-utils";
import type { StandardConfig } from "@brains/core";
import type { Logger } from "@brains/utils/logger";

describe("MigrationManager", () => {
  let mockLogger: Logger;
  let mockMigrations: IMigrationFunctions;
  let migrationManager: MigrationManager;
  const mockConfig = {
    database: {
      url: "file:test.db",
    },
    jobQueueDatabase: {
      url: "file:job-queue.db",
    },
    conversationDatabase: {
      url: "file:conversation.db",
    },
    runtimeStateDatabase: {
      url: "file:runtime-state.db",
    },
    embedding: { enabled: true },
  } satisfies StandardConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockMigrations = {
      getStandardConfigWithDirectories: mock(() => Promise.resolve(mockConfig)),
      migrateEntities: mock(() => Promise.resolve()),
      migrateJobQueue: mock(() => Promise.resolve()),
      migrateConversations: mock(() => Promise.resolve()),
      migrateRuntimeState: mock(() => Promise.resolve()),
    };

    migrationManager = new MigrationManager(mockLogger, mockMigrations);
  });

  describe("runAllMigrations", () => {
    it("should run all migrations successfully", async () => {
      await migrationManager.runAllMigrations();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Running database migrations...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Running entity database migrations...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Running job queue database migrations...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Running conversation database migrations...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Running runtime state database migrations...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "All database migrations completed successfully",
      );

      expect(mockMigrations.migrateEntities).toHaveBeenCalledWith(
        {
          url: mockConfig.database.url,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateJobQueue).toHaveBeenCalledWith(
        {
          url: mockConfig.jobQueueDatabase.url,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateConversations).toHaveBeenCalledWith(
        {
          url: mockConfig.conversationDatabase.url,
        },
        mockLogger,
      );

      expect(mockMigrations.migrateRuntimeState).toHaveBeenCalledWith(
        {
          url: mockConfig.runtimeStateDatabase.url,
        },
        mockLogger,
      );
    });

    it("should propagate config errors", async () => {
      const configError = new Error("Config failed");
      mockMigrations.getStandardConfigWithDirectories = mock(() =>
        Promise.reject(configError),
      );

      expect(migrationManager.runAllMigrations()).rejects.toThrow(configError);
    });

    it("should propagate migration errors", async () => {
      const migrationError = new Error("Entity migration failed");
      mockMigrations.migrateEntities = mock(() =>
        Promise.reject(migrationError),
      );

      expect(migrationManager.runAllMigrations()).rejects.toThrow(
        migrationError,
      );
    });

    it("should override database URLs when overrides are provided", async () => {
      const overrides = {
        database: "file:/tmp/test-entities.db",
        jobQueueDatabase: "file:/tmp/test-jobs.db",
        conversationDatabase: "file:/tmp/test-conv.db",
        runtimeStateDatabase: "file:/tmp/test-runtime-state.db",
      };

      await migrationManager.runAllMigrations(overrides);

      // Each migration should use its respective override URL
      expect(mockMigrations.migrateEntities).toHaveBeenCalledWith(
        expect.objectContaining({ url: overrides.database }),
        mockLogger,
      );

      expect(mockMigrations.migrateJobQueue).toHaveBeenCalledWith(
        expect.objectContaining({ url: overrides.jobQueueDatabase }),
        mockLogger,
      );

      expect(mockMigrations.migrateConversations).toHaveBeenCalledWith(
        expect.objectContaining({ url: overrides.conversationDatabase }),
        mockLogger,
      );

      expect(mockMigrations.migrateRuntimeState).toHaveBeenCalledWith(
        expect.objectContaining({ url: overrides.runtimeStateDatabase }),
        mockLogger,
      );
    });
  });
});
