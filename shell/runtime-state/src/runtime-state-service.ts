import type { Client } from "@libsql/client";
import { Logger } from "@brains/utils/logger";
import { applySqlitePragmas, closeSqliteClient } from "@brains/db";
import { createRuntimeStateDatabase, type RuntimeStateDB } from "./db";
import { RuntimeStateStore } from "./runtime-state-store";
import type {
  IRuntimeStateService,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
  RuntimeStateServiceConfig,
} from "./types";

export class RuntimeStateService implements IRuntimeStateService {
  private readonly db: RuntimeStateDB;
  private readonly client: Client;
  private readonly logger: Logger;
  private readonly databaseUrl: string;
  private walInitialization: Promise<void> | null = null;
  private walInitializationSettled = false;
  private closeRequested = false;
  private closePromise: Promise<void> | null = null;
  private clientClosePromise: Promise<void> | null = null;

  static createFresh(
    config: RuntimeStateServiceConfig,
    logger?: Logger,
  ): RuntimeStateService {
    return new RuntimeStateService(config, logger ?? Logger.getInstance());
  }

  private constructor(config: RuntimeStateServiceConfig, logger: Logger) {
    const { db, client, url } = createRuntimeStateDatabase(config);
    this.db = db;
    this.client = client;
    this.databaseUrl = url;
    this.logger = logger.child("RuntimeStateService");
  }

  /** Settle non-fatal database readiness work before the shell becomes ready. */
  initialize(): Promise<void> {
    if (this.closeRequested) return Promise.resolve();
    this.walInitialization ??= this.initializeWALMode().finally(() => {
      this.walInitializationSettled = true;
    });
    return this.walInitialization;
  }

  private async initializeWALMode(): Promise<void> {
    try {
      await applySqlitePragmas(this.client, this.databaseUrl);
    } catch (error) {
      this.logger.warn(
        "Failed to enable runtime state WAL mode (non-fatal)",
        error,
      );
    }
  }

  scoped<T>(options: RuntimeStateScopeOptions<T>): IRuntimeStateStore<T> {
    return new RuntimeStateStore(this.db, options.namespace, options.schema);
  }

  close(): void {
    void this.closeAsync().catch((error) => {
      this.logger.error("Failed to close runtime state storage", error);
    });
  }

  closeAsync(): Promise<void> {
    this.closeRequested = true;
    this.closePromise ??= this.closeStorage();
    return this.closePromise;
  }

  private closeStorage(): Promise<void> {
    if (this.walInitialization && !this.walInitializationSettled) {
      return this.walInitialization.then(() => this.closeClient());
    }
    return this.closeClient();
  }

  private closeClient(): Promise<void> {
    if (this.clientClosePromise) return this.clientClosePromise;
    this.clientClosePromise = closeSqliteClient(this.client);
    return this.clientClosePromise;
  }
}
