import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "src/cli.ts")],
  outdir,
  naming: "brain-db-migrate.js",
  target: "bun",
  external: ["@libsql/client", "@tursodatabase/database"],
});
if (!result.success)
  throw new AggregateError(result.logs, "Migration tool build failed");
for (const service of [
  "entity-service",
  "job-queue",
  "conversation-service",
  "runtime-state",
  "auth-service",
]) {
  await cp(
    join(root, "../../shell", service, "drizzle"),
    join(outdir, "migrations", service),
    { recursive: true },
  );
}
