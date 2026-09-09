import type { Client } from "@libsql/client";
import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import { applySqlitePragmas } from "@brains/db";
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
  private clientClosed = false;

  static createFresh(
    config: RuntimeStateServiceConfig,
    logger?: Logger,
  ): RuntimeStateService {
    return new RuntimeStateService(
      config,
      logger ?? ConsoleLogger.getInstance(),
    );
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
    this.walInitialization ??= this.initializeWALMode();
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
    } finally {
      this.walInitializationSettled = true;
      if (this.closeRequested) this.closeClient();
    }
  }

  scoped<T, TInput = T>(
    options: RuntimeStateScopeOptions<T, TInput>,
  ): IRuntimeStateStore<T, TInput> {
    const store = new RuntimeStateStore(
      this.db,
      options.namespace,
      options.schema,
    );
    // A scoped handle must not expose the implementation's database or mutable
    // namespace fields. Bind methods so detached calls retain the same scope.
    return Object.freeze({
      get: store.get.bind(store),
      has: store.has.bind(store),
      set: store.set.bind(store),
      setIfNotExists: store.setIfNotExists.bind(store),
      delete: store.delete.bind(store),
      list: store.list.bind(store),
      clear: store.clear.bind(store),
    });
  }

  close(): void {
    this.closeRequested = true;
    if (!this.walInitialization || this.walInitializationSettled) {
      this.closeClient();
    }
  }

  private closeClient(): void {
    if (this.clientClosed) return;
    this.clientClosed = true;
    this.client.close();
  }
}
