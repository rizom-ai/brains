import { appendFileSync } from "node:fs";
import { reexecLocalBrain } from "../../src/lib/local-reexec";

/**
 * A stand-in for the brain entrypoint: the same local-install hand-off, then
 * a report of the process that ran. `wait` stays up until SIGTERM and records
 * that it drained, which is what a brain's App.stop() needs the signal for.
 */
const [reportPath, mode = "once"] = process.argv.slice(2);
if (!reportPath) throw new Error("report path is required");

const status = await reexecLocalBrain({
  cwd: process.cwd(),
  args: process.argv.slice(2),
});
if (status !== undefined) process.exit(status);

// The handler is installed before readiness is reported, so a signal sent on
// "ran" never meets the default disposition.
process.on("SIGTERM", () => {
  appendFileSync(reportPath, `drained ${process.pid}\n`);
  process.exit(0);
});
appendFileSync(
  reportPath,
  `ran ${process.pid} ${process.env["BRAIN_SKIP_LOCAL_REEXEC"] ?? "-"}\n`,
);

if (mode === "wait") setInterval(() => {}, 1_000);
else process.exit(0);
