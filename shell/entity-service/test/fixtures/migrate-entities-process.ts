import { migrateEntities } from "../../src/migrate";

const databaseUrl = process.argv[2];
if (!databaseUrl) throw new Error("Expected an entity database URL");

await migrateEntities({ url: databaseUrl });
