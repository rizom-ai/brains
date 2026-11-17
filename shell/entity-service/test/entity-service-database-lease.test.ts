import { afterEach, describe, expect, it } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { EntityRegistry } from "../src/entityRegistry";
import { EntityService } from "../src/entityService";
import { readDatabaseLeases } from "../src/database-lease";
import { mockEmbeddingService } from "./helpers/mock-services";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

const databases: TestEntityDatabase[] = [];
const clients: Client[] = [];
const services: EntityService[] = [];

afterEach(async () => {
  services.splice(0).forEach((service) => service.close());
  clients.splice(0).forEach((client) => client.close());
  await Promise.all(databases.splice(0).map((db) => db.cleanup()));
});

async function database(): Promise<{
  db: TestEntityDatabase;
  client: Client;
}> {
  const db = await createTestEntityDatabase();
  databases.push(db);
  const client = createClient({ url: db.url });
  clients.push(client);
  return { db, client };
}

function service(db: TestEntityDatabase): EntityService {
  const created = EntityService.createFresh({
    embeddingService: mockEmbeddingService,
    entityRegistry: EntityRegistry.createFresh(createSilentLogger()),
    logger: createSilentLogger(),
    jobQueueService: createMockJobQueueService(),
    dbConfig: db.config,
    embeddingDbConfig: db.embeddingConfig,
  });
  services.push(created);
  return created;
}

describe("EntityService database lease", () => {
  it("holds a brain lease from initialization until released", async () => {
    const { db, client } = await database();
    const entityService = service(db);

    await entityService.initialize();
    const leases = await readDatabaseLeases(client);
    expect(leases).toHaveLength(1);
    expect(leases[0]).toMatchObject({ role: "brain", pid: process.pid });

    await entityService.releaseDatabaseLease();
    expect(await readDatabaseLeases(client)).toEqual([]);
  });

  it("refuses to start while a maintenance command converts the database", async () => {
    const { db, client } = await database();
    const now = Date.now();
    await client.execute({
      sql: "INSERT INTO database_leases (id, role, command, hostname, pid, started_at, heartbeat_at, expires_at) VALUES ('run', 'maintenance', 'assets:migrate', 'one-off-container', 99, ?, ?, ?)",
      args: [now - 5_000, now - 1_000, now + 59_000],
    });

    const failure = await service(db)
      .initialize()
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("assets:migrate");
    expect(String(failure)).toContain("one-off-container");
  });
});
