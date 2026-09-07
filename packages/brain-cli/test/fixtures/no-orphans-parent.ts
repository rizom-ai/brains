import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [reportDir, mode = "wait", detached = "0"] = process.argv.slice(2);
if (!reportDir) throw new Error("report directory is required");

const child = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, "no-orphans-tree-node.ts"),
    "child",
    reportDir,
    "1",
    detached,
  ],
  {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    detached: detached === "1",
  },
);

// Install the handler before publishing readiness, for the same reason the
// tree nodes do: parent.pid is the test's signal that SIGTERM will be drained.
let stopping = false;
process.on("SIGTERM", async () => {
  if (stopping) return;
  stopping = true;
  appendFileSync(join(reportDir, "events.log"), "parent:sigterm\n");
  child.kill("SIGTERM");
  await child.exited;
  appendFileSync(join(reportDir, "events.log"), "parent:drained\n");
  process.exit(0);
});

// The whole tree is ready only once the deepest node has published its pid.
while (!existsSync(join(reportDir, "grandchild.pid"))) await Bun.sleep(5);
appendFileSync(join(reportDir, "events.log"), `parent:ready:${process.pid}\n`);
writeFileSync(join(reportDir, "parent.pid"), String(process.pid));

if (mode === "clean") {
  appendFileSync(join(reportDir, "events.log"), "parent:clean-exit\n");
  process.exit(0);
}

setInterval(() => {}, 1_000);
