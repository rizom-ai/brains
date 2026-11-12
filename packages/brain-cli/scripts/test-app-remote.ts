/**
 * The content remote a test app boots from when its seed lives outside this
 * repository, such as the rizom-ai app's checkout of the live content.
 *
 * That seed's agents are real brains. The remote is built from a copy of it
 * in which every agent is withheld: an approved peer becomes a discovered
 * contact, so no directory scan walks it and no `agent_call` reaches it, and
 * its ATProto card references go, so no card refresh fetches them. The seed
 * itself is only read.
 */
import { runProcess } from "@brains/utils/run-process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/** The fields through which a card refresh reaches plc.directory and a PDS. */
const ATPROTO_CARD_FIELDS = [
  "repoDid",
  "brainDid",
  "cardUri",
  "cardCid",
  "cardLastError",
  "cardFailureCount",
  "cardUnavailableAt",
  "cardStaleAfter",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAgent(
  markdown: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return null;
  const frontmatter: unknown = parseYaml(match[1] ?? "");
  return isRecord(frontmatter) ? { frontmatter, body: match[2] ?? "" } : null;
}

/** An agent file as the test app may save it: never approved, no card. */
export function withholdAgent(markdown: string): string {
  const agent = parseAgent(markdown);
  if (!agent) return markdown;
  const frontmatter = Object.fromEntries(
    Object.entries(agent.frontmatter)
      .filter(([key]) => !ATPROTO_CARD_FIELDS.some((field) => field === key))
      .map(([key, value]) =>
        key === "status" && value === "approved"
          ? [key, "discovered"]
          : [key, value],
      ),
  );
  return `---\n${stringifyYaml(frontmatter)}---\n${agent.body}`;
}

/** What an agent file holds that would let the test app reach it. */
function agentProblems(path: string, markdown: string): string[] {
  const agent = parseAgent(markdown);
  if (!agent) return [];
  return [
    ...(agent.frontmatter["status"] === "approved"
      ? [`${path}: status approved`]
      : []),
    ...(ATPROTO_CARD_FIELDS.some((field) => field in agent.frontmatter)
      ? [`${path}: ATProto card reference`]
      : []),
  ];
}

const isAgentPath = (path: string): boolean =>
  path.endsWith(".md") && path.split("/").slice(0, -1).includes("agent");

async function git(args: string[], cwd?: string): Promise<string> {
  const result = await runProcess(["git", ...args], cwd ? { cwd } : {});
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

async function hasBranch(remotePath: string, branch: string): Promise<boolean> {
  if (!existsSync(remotePath)) return false;
  const result = await runProcess([
    "git",
    "--git-dir",
    remotePath,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return result.exitCode === 0;
}

/** The agents on a remote's branch that a test app could reach. */
export async function remoteAgentProblems(
  gitUrl: string,
  branch: string,
): Promise<string[]> {
  const remotePath = fileURLToPath(gitUrl);
  if (!(await hasBranch(remotePath, branch))) return [];
  const paths = (
    await git(["--git-dir", remotePath, "ls-tree", "-r", "--name-only", branch])
  )
    .split("\n")
    .filter(isAgentPath);
  const problems = await Promise.all(
    paths.map(async (path) =>
      agentProblems(
        path,
        await git(["--git-dir", remotePath, "show", `${branch}:${path}`]),
      ),
    ),
  );
  return problems.flat();
}

async function withholdAgentFiles(dir: string): Promise<void> {
  const entries = await readdir(dir, { recursive: true });
  await Promise.all(
    entries
      .map((entry) => entry.split("\\").join("/"))
      .filter(isAgentPath)
      .map(async (path) => {
        const file = join(dir, path);
        await writeFile(file, withholdAgent(await readFile(file, "utf8")));
      }),
  );
}

export interface TestAppRemoteOptions {
  /** The seed outside this repository; read, never written. */
  seedPath: string;
  /** The local `file://` remote the test app syncs through. */
  gitUrl: string;
  branch: string;
}

/**
 * Build the remote from a withheld copy of the seed, or check the one already
 * built: a remote holding a peer the app could reach is refused.
 */
export async function prepareTestAppRemote(
  options: TestAppRemoteOptions,
): Promise<"prepared" | "present"> {
  const remotePath = fileURLToPath(options.gitUrl);
  if (await hasBranch(remotePath, options.branch)) {
    const problems = await remoteAgentProblems(options.gitUrl, options.branch);
    if (problems.length > 0) {
      throw new Error(
        `${options.gitUrl} holds agents a test app must not reach:\n${problems.join("\n")}`,
      );
    }
    return "present";
  }

  if (!existsSync(options.seedPath)) {
    throw new Error(`Seed content path not found: ${options.seedPath}`);
  }
  mkdirSync(remotePath, { recursive: true });
  await git([
    "init",
    "--bare",
    `--initial-branch=${options.branch}`,
    remotePath,
  ]);

  const work = mkdtempSync(join(tmpdir(), "test-app-remote-"));
  try {
    cpSync(options.seedPath, work, {
      recursive: true,
      filter: (source) => !source.split("/").includes(".git"),
    });
    await withholdAgentFiles(work);
    await git(["init", `--initial-branch=${options.branch}`], work);
    await git(["add", "."], work);
    await git(
      [
        "-c",
        "user.name=Brain",
        "-c",
        "user.email=brain@localhost",
        "commit",
        "-m",
        "seed content remote, agents withheld",
      ],
      work,
    );
    await git(["push", options.gitUrl, options.branch], work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return "prepared";
}
