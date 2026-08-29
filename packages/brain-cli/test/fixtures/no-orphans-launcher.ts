import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [reportDir, detached = "0"] = process.argv.slice(2);
if (!reportDir) throw new Error("report directory is required");

const child = Bun.spawn(
  [
    process.execPath,
    "--no-orphans",
    join(import.meta.dir, "no-orphans-parent.ts"),
    reportDir,
    "wait",
    detached,
  ],
  { stdin: "ignore", stdout: "ignore", stderr: "inherit" },
);
writeFileSync(join(reportDir, "flagged.pid"), String(child.pid));
setInterval(() => {}, 1_000);
