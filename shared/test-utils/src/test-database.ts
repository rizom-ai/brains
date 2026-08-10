import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Anything with a `close()` — libSQL clients, Drizzle handles, and the fakes
 * used to test this helper all qualify. Kept structural so `@brains/test-utils`
 * needs no dependency on any database package.
 */
export interface ClosableClient {
  close: () => void;
}

export interface TestDatabaseOptions {
  /** Temp directory prefix, e.g. `brain-entity-test-`. */
  prefix: string;
  /** Database filename within the temp directory, e.g. `test-entities.db`. */
  filename: string;
  /**
   * Runs against the resolved `file:` URL before the handle is returned.
   *
   * Injected rather than imported so this package gains no dependency on
   * `shell/*` — that direction would invert the graph and cycle through the
   * mocks. Each package supplies its own migrator.
   */
  migrate: (url: string) => Promise<void>;
}

export interface TestDirectory {
  /** Absolute path to the temp directory. */
  dir: string;
  /** Remove the directory. Idempotent. */
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated temp directory for one test.
 *
 * The directory primitive `createTestDatabase` is built on, exposed separately
 * for tests that need a scratch directory without a database in it.
 */
export async function createTestDirectory(
  prefix = "brain-test-",
): Promise<TestDirectory> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  let removed = false;
  return {
    dir,
    cleanup: async (): Promise<void> => {
      if (removed) return;
      removed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export interface TestDatabase {
  /** libSQL connection string for the created file. */
  url: string;
  /** Absolute path to the database file. */
  dbPath: string;
  /** Absolute path to the temp directory holding it. */
  dir: string;
  /**
   * Register a client so `cleanup` closes it. Returns the client unchanged so
   * it can be wrapped inline: `const { db, client } = track(createDb(config))`.
   */
  track: <T extends ClosableClient>(client: T) => T;
  /** Close every tracked client, then remove the temp directory. Idempotent. */
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated, file-backed database for one test.
 *
 * File-backed rather than `:memory:` on purpose: libSQL gives each connection
 * its own in-memory database, and both these helpers and the services under
 * test open several connections against one URL, so in-memory would hand each
 * of them a different empty database.
 *
 * The single cleanup contract is the point. Four packages previously
 * implemented this flow and disagreed about who closes what, which is how one
 * of them ended up opening a throwaway connection purely to close it.
 */
export async function createTestDatabase(
  options: TestDatabaseOptions,
): Promise<TestDatabase> {
  const directory = await createTestDirectory(options.prefix);
  const dbPath = join(directory.dir, options.filename);
  const url = `file:${dbPath}`;

  const clients: ClosableClient[] = [];

  const cleanup = async (): Promise<void> => {
    clients.splice(0).forEach((client) => {
      client.close();
    });
    await directory.cleanup();
  };

  try {
    await options.migrate(url);
  } catch (error) {
    // A half-migrated directory is never useful, and leaving it behind would
    // leak a temp dir for every failing test.
    await cleanup();
    throw error;
  }

  return {
    url,
    dbPath,
    dir: directory.dir,
    track: <T extends ClosableClient>(client: T): T => {
      clients.push(client);
      return client;
    },
    cleanup,
  };
}
