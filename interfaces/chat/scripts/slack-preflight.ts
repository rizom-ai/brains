import { runSlackPreflight } from "../src/slack-preflight";
import { getErrorMessage } from "@brains/utils/error";

try {
  const result = await runSlackPreflight(process.env);
  console.log(
    `Slack preflight passed: ${result.botUserName} (${result.botUserId}) in ${result.teamName} (${result.teamId}).`,
  );
} catch (error: unknown) {
  const message = getErrorMessage(error, "Unknown error");
  console.error(`Slack preflight failed: ${message}`);
  process.exitCode = 1;
}
