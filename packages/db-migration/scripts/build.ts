import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
const external = ["@libsql/client", "@tursodatabase/database"];
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "src/cli.ts")],
  outdir,
  naming: "brain-db-migrate.js",
  target: "bun",
  external,
});
if (!result.success)
  throw new AggregateError(result.logs, "Migration tool build failed");
// The bundled default SQL factory resolves only this installed sibling tree.
const workers = await Bun.build({
  entrypoints: ["worker", "network-ingress-worker", "network-read-worker"].map(
    (name) => join(root, "../../shared/db/src/turso-worker", `${name}.ts`),
  ),
  outdir: join(outdir, "turso-worker"),
  naming: "[name].ts",
  target: "bun",
  format: "esm",
  external,
});
if (!workers.success)
  throw new AggregateError(
    workers.logs,
    "Migration worker artifact build failed",
  );
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
