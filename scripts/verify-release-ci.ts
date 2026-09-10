#!/usr/bin/env bun
import { z } from "@brains/utils/zod";
import { verifyReleaseCi } from "./lib/release-ci";

const workflow = z.enum(["ci.yml", "site-ci.yml"]).parse(process.argv[2]);
const repository = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
  .parse(process.env["GITHUB_REPOSITORY"]);

async function run(...command: string[]): Promise<string> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0)
      throw new Error(
        `Release CI command ${command[0]} failed: ${stderr.trim()}`,
      );
    return stdout.trim();
  } finally {
    clearTimeout(timeout);
  }
}
const sha = await run("git", "rev-parse", "HEAD");
const id = await verifyReleaseCi(sha, {
  runs: async (): Promise<unknown> =>
    JSON.parse(
      await run(
        "gh",
        "api",
        "--method",
        "GET",
        `repos/${repository}/actions/workflows/${workflow}/runs`,
        "-f",
        `head_sha=${sha}`,
        "-f",
        "branch=main",
        "-f",
        "per_page=100",
      ),
    ),
  mainSha: () =>
    run(
      "gh",
      "api",
      `repos/${repository}/git/ref/heads/main`,
      "--jq",
      ".object.sha",
    ),
  dispatch: async () => {
    await run(
      "gh",
      "workflow",
      "run",
      workflow,
      "--ref",
      "main",
      "--repo",
      repository,
    );
  },
  wait: () => Bun.sleep(5_000),
  now: Date.now,
});
console.log(`Verified ${workflow} run ${id} for checked-out source ${sha}`);
