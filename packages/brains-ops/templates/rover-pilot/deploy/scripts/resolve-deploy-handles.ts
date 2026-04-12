import { execFileSync } from "node:child_process";
import { requireEnv, writeGitHubOutput } from "./helpers";

const eventName = requireEnv("GITHUB_EVENT_NAME");

if (eventName === "workflow_dispatch") {
  const handle = requireEnv("HANDLE_INPUT");
  writeGitHubOutput("handles_json", JSON.stringify([handle]));
  process.exit(0);
}

if (eventName !== "push") {
  throw new Error(`Unsupported GITHUB_EVENT_NAME: ${eventName}`);
}

const beforeSha = requireEnv("BEFORE_SHA");
const currentSha = requireEnv("GITHUB_SHA");

if (!isUsableGitRevision(beforeSha) || !isUsableGitRevision(currentSha)) {
  writeGitHubOutput("handles_json", JSON.stringify([]));
  process.exit(0);
}

const diffOutput = execFileSync(
  "git",
  ["diff", "--name-only", beforeSha, currentSha],
  { encoding: "utf8" },
);

const handles = [
  ...new Set(
    diffOutput
      .split(/\r?\n/)
      .map((path) => {
        const match = path.match(/^users\/([^/]+)\/(?:\.env|brain\.yaml)$/);
        return match?.[1] ?? null;
      })
      .filter((handle): handle is string => handle !== null)
      .sort((left, right) => left.localeCompare(right)),
  ),
];

writeGitHubOutput("handles_json", JSON.stringify(handles));

function isUsableGitRevision(revision: string): boolean {
  if (!revision || /^0+$/.test(revision)) {
    return false;
  }

  try {
    execFileSync("git", ["rev-parse", "--verify", revision], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
