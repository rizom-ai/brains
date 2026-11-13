/**
 * A supervised child that crashes, the way `crash-handlers.test.ts` needs one:
 * its role is set, the app's crash handlers are installed, and then it either
 * throws or leaves a rejection unhandled.
 * Usage: bun crash-in-child.ts <role> <throw|reject>
 */
import { ConsoleLogger } from "@brains/utils/logger";
import { installCrashHandlers } from "../../src/cli";

const [role, kind] = process.argv.slice(2);
ConsoleLogger.setProcessRole(role);
installCrashHandlers("brain");

if (kind === "reject") {
  void Promise.reject(new Error("boom"));
} else {
  setTimeout(() => {
    throw new Error("boom");
  }, 0);
}
