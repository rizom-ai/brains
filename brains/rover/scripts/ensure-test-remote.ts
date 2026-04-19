import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REMOTE_PATH = "/tmp/rover-test-content.git";

if (!existsSync(REMOTE_PATH)) {
  mkdirSync(REMOTE_PATH, { recursive: true });
  const result = spawnSync(
    "git",
    ["init", "--bare", "--initial-branch=main", REMOTE_PATH],
    {
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
