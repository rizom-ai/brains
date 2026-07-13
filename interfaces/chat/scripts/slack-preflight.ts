import { runSlackPreflight } from "../src/slack-preflight";

try {
  const result = await runSlackPreflight(process.env);
  console.log(
    `Slack preflight passed: ${result.botUserName} (${result.botUserId}) in ${result.teamName} (${result.teamId}); test user ${result.testUserId}.`,
  );
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Slack preflight failed: ${message}`);
  process.exitCode = 1;
}
