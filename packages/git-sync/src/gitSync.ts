import type { EntityService, BaseEntity, Logger } from "@brains/types";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { join, basename } from "path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
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
    // Check for .git directory specifically to avoid detecting parent repos
    const gitDir = join(this.repoPath, ".git");
    const hasGitDir = existsSync(gitDir);
    this.logger.debug("Git directory check", { hasGitDir, gitDir });

    if (!hasGitDir) {
      this.logger.debug("Initializing git repository...");
      await this.git.init();
      this.logger.info("Initialized new git repository", {
        path: this.repoPath,
      });

      // Verify it was created
      const hasGitDirAfter = existsSync(gitDir);
      this.logger.debug("Git directory check after init", { hasGitDirAfter });
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
      } catch {
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
      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000, // Get all entities
      });

      for (const entity of entities) {
        // Get the adapter to convert to markdown
        const adapter = this.entityService.getAdapter(entityType);
        const markdown = adapter.toMarkdown(entity);
        const filePath = this.getEntityFilePath(entity);

        // Ensure directory exists (only for non-base entities)
        if (entityType !== 'base') {
          const dir = join(this.repoPath, entityType);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
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

    // Get all directories in the repo
    const entries = readdirSync(this.repoPath, { withFileTypes: true });

    // Process root directory files as base entity type
    const rootFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({ path: entry.name, entityType: "base" }));

    // Process subdirectories - directory name IS the entity type
    const subDirs = entries.filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith("."),
    );

    // Build list of all files to process
    const filesToProcess: Array<{ path: string; entityType: string }> = [
      ...rootFiles,
    ];

    for (const dir of subDirs) {
      const dirPath = join(this.repoPath, dir.name);
      const files = readdirSync(dirPath)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          path: join(dir.name, f),
          entityType: dir.name, // Directory name is the entity type
        }));
      filesToProcess.push(...files);
    }

    // Track import statistics
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // Process each file
    for (const { path, entityType } of filesToProcess) {
      // Skip if entity type is not registered
      if (!this.entityService.hasAdapter(entityType)) {
        this.logger.debug("Skipping file - no adapter for entity type", {
          path,
          entityType,
        });
        skipped++;
        continue;
      }

      const filePath = join(this.repoPath, path);
      const markdown = readFileSync(filePath, "utf-8");
      const stats = statSync(filePath);

      // Extract filename without extension for id and title
      const filename = basename(path, ".md");

      try {
        // Use file timestamps, but fallback to current time if birthtime is invalid
        // (birthtime can be 1970 on some filesystems that don't track creation time)
        const created =
          stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
        const updated = stats.mtime;

        this.logger.debug("File timestamps", {
          path,
          birthtime: stats.birthtime.toISOString(),
          mtime: stats.mtime.toISOString(),
          using: {
            created: created.toISOString(),
            updated: updated.toISOString(),
          },
        });

        // Pass file metadata along with content
        await this.entityService.importRawEntity({
          entityType,
          id: filename,
          content: markdown,
          created,
          updated,
        });
        this.logger.debug("Imported entity from git", {
          path,
          entityType,
        });
        imported++;
      } catch (error) {
        this.logger.error("Failed to import entity", {
          path,
          entityType,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    this.logger.info("Import completed", {
      total: filesToProcess.length,
      imported,
      skipped,
      failed,
    });
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
      } catch {
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
    // Base entities go in root directory, others in subdirectories
    if (entity.entityType === 'base') {
      return join(this.repoPath, `${entity.id}.md`);
    } else {
      // Other entity types go in their own directories
      return join(this.repoPath, entity.entityType, `${entity.id}.md`);
    }
  }
}
