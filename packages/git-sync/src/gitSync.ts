import type { EntityService, BaseEntity, Logger } from "@brains/types";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { join } from "path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "fs";
import { z } from "zod";

/**
 * GitSync options schema
 */
export const gitSyncOptionsSchema = z.object({
  repoPath: z.string(),
  remote: z.string().optional(),
  branch: z.string().optional(),
  autoSync: z.boolean().optional(),
  syncInterval: z.number().optional(),
  entityService: z.any(), // We can't validate these complex types with Zod
  logger: z.any(),
});

export type GitSyncOptions = z.infer<typeof gitSyncOptionsSchema> & {
  entityService: EntityService;
  logger: Logger;
};

/**
 * Git sync status
 */
export interface GitSyncStatus {
  isRepo: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  branch: string;
  lastCommit?: string | undefined;
  files: Array<{
    path: string;
    status: string;
  }>;
}

/**
 * GitSync handles synchronization of entities with a git repository
 */
export class GitSync {
  private _git: SimpleGit | null = null;
  private entityService: EntityService;
  private logger: Logger;
  private repoPath: string;
  private remote: string | undefined;
  private branch: string;
  private autoSync: boolean;
  private syncInterval: number;
  private syncTimer: Timer | undefined;

  constructor(options: GitSyncOptions) {
    // Validate options (excluding the complex types)
    const { entityService, logger, ...validatableOptions } = options;
    gitSyncOptionsSchema
      .omit({ entityService: true, logger: true })
      .parse(validatableOptions);

    this.entityService = entityService;
    this.logger = logger.child("GitSync");
    this.repoPath = options.repoPath;
    this.remote = options.remote;
    this.branch = options.branch ?? "main";
    this.autoSync = options.autoSync ?? false;
    this.syncInterval = options.syncInterval ?? 30;
  }

  /**
   * Lazy getter for git instance - creates directory if needed
   */
  private get git(): SimpleGit {
    if (!this._git) {
      // Ensure directory exists before creating SimpleGit instance
      if (!existsSync(this.repoPath)) {
        mkdirSync(this.repoPath, { recursive: true });
      }
      this._git = simpleGit(this.repoPath);
    }
    return this._git;
  }

  /**
   * Initialize git repository
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing git repository", { path: this.repoPath });

    // Ensure repo path exists
    if (!existsSync(this.repoPath)) {
      mkdirSync(this.repoPath, { recursive: true });
      this.logger.info("Created git repository directory", {
        path: this.repoPath,
      });
    }

    // Git instance will be created lazily via getter

    // Initialize git repo if needed
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      await this.git.init();
      this.logger.info("Initialized new git repository", {
        path: this.repoPath,
      });
    }

    // Set remote if provided
    if (this.remote) {
      const remotes = await this.git.getRemotes();
      if (!remotes.find((r) => r.name === "origin")) {
        await this.git.addRemote("origin", this.remote);
        this.logger.info("Added git remote", { remote: this.remote });
      }
    }

    // Set branch
    if (this.branch && this.branch !== "main") {
      try {
        await this.git.checkoutBranch(this.branch, "HEAD");
      } catch (error) {
        // Branch might not exist yet, will be created on first commit
        this.logger.debug("Branch does not exist yet", { branch: this.branch });
      }
    }
  }

  /**
   * Sync all entities with git
   */
  async sync(): Promise<void> {
    this.logger.info("Starting full sync");

    // Import from git first
    await this.importFromGit();

    // Export all entities
    await this.exportToGit();

    // Commit and push if there are changes
    await this.commit();

    this.logger.info("Full sync completed");
  }

  /**
   * Export all entities to git
   */
  async exportToGit(): Promise<void> {
    this.logger.debug("Exporting entities to git");

    const entityTypes = this.entityService.getEntityTypes();

    // For each entity type, get all entities and save to markdown
    for (const entityType of entityTypes) {
      const entities = await this.entityService.listEntities({
        entityType,
        limit: 1000, // Get all entities
      });

      for (const entity of entities) {
        // Get the adapter to convert to markdown
        const adapter = this.entityService.getAdapter(entityType);
        const markdown = adapter.toMarkdown(entity);
        const filePath = this.getEntityFilePath(entity);

        // Ensure directory exists
        const dir = join(this.repoPath, entityType);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Write markdown file
        writeFileSync(filePath, markdown, "utf-8");
        this.logger.debug("Exported entity", { entityType, id: entity.id });
      }
    }

    this.logger.info("Export completed");
  }

  /**
   * Import entities from git
   */
  async importFromGit(): Promise<void> {
    this.logger.debug("Importing entities from git");

    // Pull latest changes from remote if configured
    if (this.remote) {
      try {
        await this.git.pull("origin", this.branch);
        this.logger.info("Pulled latest changes from remote");
      } catch (error) {
        this.logger.warn("Failed to pull from remote", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const entityTypes = this.entityService.getEntityTypes();

    // For each entity type, read markdown files and import
    for (const entityType of entityTypes) {
      const dir = join(this.repoPath, entityType);

      if (!existsSync(dir)) {
        continue;
      }

      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

      // Read and process each markdown file
      for (const file of files) {
        const filePath = join(dir, file);
        const markdown = readFileSync(filePath, "utf-8");

        try {
          // Parse entity from markdown using adapter
          const adapter = this.entityService.getAdapter(entityType);
          const entity = adapter.fromMarkdown(markdown);

          // Check if entity exists
          const existing = await this.entityService.getEntity(
            entityType,
            entity.id,
          );

          if (existing) {
            // Update if modified
            if (existing.updated < entity.updated) {
              await this.entityService.updateEntity(entity);
              this.logger.debug("Updated entity from git", {
                entityType,
                id: entity.id,
              });
            }
          } else {
            // Create new entity
            await this.entityService.createEntity(entity);
            this.logger.debug("Created entity from git", {
              entityType,
              id: entity.id,
            });
          }
        } catch (error) {
          this.logger.error("Failed to import entity", {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger.info("Import completed");
  }

  /**
   * Commit and push changes to remote
   */
  async commit(message?: string): Promise<void> {
    const status = await this.git.status();
    if (status.files.length > 0) {
      await this.git.add(".");
      await this.git.commit(
        message ?? `Brain sync: ${new Date().toISOString()}`,
      );
      this.logger.info("Committed changes", { files: status.files.length });

      if (this.remote) {
        try {
          await this.git.push("origin", this.branch);
          this.logger.info("Pushed changes to remote");
        } catch (error) {
          this.logger.error("Failed to push to remote", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      this.logger.debug("No changes to commit");
    }
  }

  /**
   * Get git repository status
   */
  async getStatus(): Promise<GitSyncStatus> {
    const status = await this.git.status();
    const isRepo = await this.git.checkIsRepo();

    let lastCommit: string | undefined;
    if (isRepo) {
      try {
        const log = await this.git.log({ maxCount: 1 });
        lastCommit = log.latest?.hash;
      } catch (error) {
        // No commits yet
      }
    }

    return {
      isRepo,
      hasChanges: status.files.length > 0,
      ahead: status.ahead,
      behind: status.behind,
      branch: status.current ?? this.branch,
      lastCommit,
      files: status.files.map((f) => ({
        path: f.path,
        status: f.working_dir || f.index || "?",
      })),
    };
  }

  /**
   * Start auto-sync if configured
   */
  async startAutoSync(): Promise<void> {
    if (!this.autoSync) {
      return;
    }

    this.logger.info("Starting auto-sync", { interval: this.syncInterval });

    // Do initial sync
    await this.sync();

    this.syncTimer = setInterval(() => {
      void this.sync().catch((error) => {
        this.logger.error("Auto-sync failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.syncInterval * 1000);
  }

  /**
   * Stop auto-sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      this.logger.info("Stopped auto-sync");
    }
  }

  /**
   * Get entity file path
   */
  private getEntityFilePath(entity: BaseEntity): string {
    // Use entityType as directory and title as filename
    const title = entity.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
    return join(this.repoPath, entity.entityType, `${title}.md`);
  }
}
