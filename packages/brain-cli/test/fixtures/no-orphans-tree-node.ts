import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [role, reportDir, spawnGrandchild = "0", detachedGrandchild = "0"] =
  process.argv.slice(2);
if (!role || !reportDir) {
  throw new Error("role and report directory are required");
}

let grandchild: ReturnType<typeof Bun.spawn> | undefined;
if (spawnGrandchild === "1") {
  grandchild = Bun.spawn(
    [process.execPath, import.meta.path, "grandchild", reportDir, "0", "0"],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      detached: detachedGrandchild === "1",
    },
  );
}

// Install the handler before publishing readiness. The pid file is what the
// test and this node's parent wait on, so it must mean "ready to drain
// gracefully". Writing it first leaves a window where SIGTERM takes the
// default disposition and the node dies without reporting.
let stopping = false;
process.on("SIGTERM", async () => {
  if (stopping) return;
  stopping = true;
  appendFileSync(join(reportDir, "events.log"), `${role}:sigterm\n`);
  if (grandchild) {
    grandchild.kill("SIGTERM");
    await grandchild.exited;
  }
  appendFileSync(join(reportDir, "events.log"), `${role}:drained\n`);
  process.exit(0);
});

appendFileSync(join(reportDir, "events.log"), `${role}:ready:${process.pid}\n`);
writeFileSync(join(reportDir, `${role}.pid`), String(process.pid));

setInterval(() => {}, 1_000);
