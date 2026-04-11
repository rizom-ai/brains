import { mkdirSync } from "fs";
import { join } from "path";
import { spawn, execSync } from "child_process";
import pkg from "../package.json" with { type: "json" };
import type { ParsedArgs } from "./parse-args";
import { scaffold, type ScaffoldOptions } from "./commands/init";
import { promptInitOptions, isInteractive } from "./lib/init-prompts";
import { start } from "./commands/start";
import { operate } from "./commands/operate";
import { operateRemote } from "./commands/operate-remote";
import { runEval } from "./commands/eval";
import { pin } from "./commands/pin";
import { resolveRemoteUrl, resolveToken } from "./lib/remote-config";
import { diagnostics } from "./commands/diagnostics";
import { runCertBootstrap } from "./commands/cert-bootstrap";
import { runSecretsPush } from "./commands/secrets-push";
import { runSshKeyBootstrap } from "./commands/ssh-key-bootstrap";

export interface CommandResult {
  success: boolean;
  message?: string;
}

/**
 * Execute a parsed CLI command.
 */
export async function runCommand(
  parsed: ParsedArgs,
  dir: string,
): Promise<CommandResult> {
  // Both `brain cert bootstrap` and `brain cert:bootstrap` reach the same
  // handler — collapse the space form to the colon form so the switch below
  // (and any future flag added to the option object) only has to be touched
  // once per subcommand.
  const command = collapseSubcommand(parsed.command, parsed.args);

  switch (command) {
    case "init":
      return runInit(parsed, dir);
    case "start":
      return start(dir, { chat: false });
    case "chat":
      return start(dir, { chat: true });
    case "eval":
      return runEval(dir, process.argv.slice(2));
    case "pin":
      return pin(dir);
    case "diagnostics":
      return diagnostics(dir, parsed.args[0] ?? "");
    case "cert:bootstrap":
      return runCertBootstrap(dir, {
        pushTo: parsed.flags["push-to"],
      });
    case "secrets:push":
      return runSecretsPush(dir, {
        pushTo: parsed.flags["push-to"],
        all: parsed.flags.all,
        only: parsed.flags.only,
        dryRun: parsed.flags["dry-run"],
      });
    case "ssh-key:bootstrap":
      return runSshKeyBootstrap(dir, {
        pushTo: parsed.flags["push-to"],
      });
    case "tool":
      return runRawTool(parsed, dir);
    case "help":
      return runHelp(dir);
    case "version":
      return runVersion();
    default:
      // Remote mode — query deployed brain via MCP HTTP
      if (parsed.flags.remote) {
        const url = resolveRemoteUrl(parsed.flags.remote);
        const token = resolveToken(parsed.flags.token);
        return operateRemote(
          url,
          parsed.command,
          parsed.args,
          parsed.flags,
          token,
        );
      }
      // Local mode — boot brain, invoke tool
      return operate(dir, parsed.command, parsed.args, parsed.flags);
  }
}

function collapseSubcommand(command: string, args: string[]): string {
  if (command === "cert" && args[0] === "bootstrap") return "cert:bootstrap";
  if (command === "secrets" && args[0] === "push") return "secrets:push";
  if (command === "ssh-key" && args[0] === "bootstrap") {
    return "ssh-key:bootstrap";
  }
  return command;
}

async function runInit(
  parsed: ParsedArgs,
  cwd: string,
): Promise<CommandResult> {
  const target = parsed.args[0];
  if (!target) {
    return {
      success: false,
      message:
        "Usage: brain init <directory> [--model rover] [--backend none] [--deploy] [--regen]",
    };
  }

  const dir = join(cwd, target);
  mkdirSync(dir, { recursive: true });

  // Build the initial options from flags. These act as defaults / pre-filled
  // values when prompting, and as the complete config when running
  // non-interactively.
  const initialOptions: ScaffoldOptions = {
    model: parsed.flags.model ?? "rover",
    domain: parsed.flags.domain,
    contentRepo: parsed.flags["content-repo"],
    backend: parsed.flags.backend,
    deploy: parsed.flags.deploy,
    regen: parsed.flags.regen,
    apiKey: parsed.flags["ai-api-key"],
  };

  // Prompt for missing values when running interactively. Tests and CI
  // pass --no-interactive (or run in a non-TTY environment) to skip prompts.
  const interactive = !parsed.flags["no-interactive"] && isInteractive();

  const finalOptions = interactive
    ? await promptInitOptions(initialOptions, dir)
    : initialOptions;

  scaffold(dir, finalOptions);

  return {
    success: true,
    message: `Brain instance ready in ${dir}`,
  };
}

async function runRawTool(
  parsed: ParsedArgs,
  dir: string,
): Promise<CommandResult> {
  const toolName = parsed.args[0];
  const inputJson = parsed.args[1];

  if (!toolName) {
    return {
      success: false,
      message: 'Usage: brain tool <toolName> [\'{"key": "value"}\']',
    };
  }

  const runner = (await import("./commands/start")).findRunner(dir);
  if (!runner) {
    return {
      success: false,
      message: "Could not find brain runner.",
    };
  }

  const runnerArgs = ["run", runner.path, "--tool", toolName];
  if (inputJson) {
    runnerArgs.push("--tool-input", inputJson);
  }

  return new Promise((resolve) => {
    const proc = spawn("bun", runnerArgs, {
      cwd: dir,
      stdio: "inherit",
      env: process.env,
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        ...(code !== 0
          ? { message: `Tool failed with exit code ${code}` }
          : {}),
      });
    });
  });
}

async function runHelp(cwd?: string): Promise<CommandResult> {
  const lines = [
    "brain — CLI for managing brain instances",
    "",
    "Usage: brain <command> [options]",
    "",
    "Commands:",
    "  init <dir>    Scaffold a new brain instance",
    "  start         Start the brain (all daemons)",
    "  chat          Start with interactive chat REPL",
    "  eval          Run AI evaluations (pass-through to brain-eval)",
    "  pin           Pin @rizom/brain version (creates package.json, installs)",
    "  cert:bootstrap   Issue Cloudflare Origin CA cert for brain.yaml domain",
    "  secrets:push    Push env-backed local secrets to GitHub Secrets",
    "  ssh-key:bootstrap Bootstrap a Hetzner deploy SSH key and optional GitHub secret",
    "  tool <name>     Invoke a tool directly (for debugging)",
    "  help          Show this help message",
  ];

  // If brain.yaml exists, discover CLI-enabled tools
  const dir = cwd ?? process.cwd();
  const hasBrainYaml = (await import("fs")).existsSync(
    (await import("path")).join(dir, "brain.yaml"),
  );

  if (hasBrainYaml) {
    const runner = (await import("./commands/start")).findRunner(dir);
    if (runner) {
      try {
        const output = execSync(`bun run ${runner.path} --list-cli-commands`, {
          cwd: dir,
          stdio: ["ignore", "pipe", "ignore"],
          env: process.env,
        }).toString();

        if (output.trim()) {
          lines.push("", "Brain commands:");
          for (const line of output.trim().split("\n")) {
            lines.push(`  ${line}`);
          }
        }
      } catch {
        // Couldn't boot brain — skip dynamic commands
      }
    }
  } else {
    lines.push(
      "",
      "Run from a directory with brain.yaml to see available brain commands.",
    );
  }

  lines.push(
    "",
    "Options:",
    "  --help, -h    Show help",
    "  --version, -v Show version",
    "",
    "Remote mode:",
    "  --remote <url>         Query a deployed brain via MCP HTTP",
    "  --token <token>        Auth token (or set BRAIN_REMOTE_TOKEN)",
    "",
    "Init options:",
    "  --model <name>         Brain model (default: rover)",
    "  --domain <domain>      Domain (default: {model}.rizom.ai)",
    "  --content-repo <repo>  Content repo (e.g. github:user/brain-data)",
    "  --backend <name>       Secret backend (default: none — env vars resolved by varlock)",
    "  --deploy               Include Kamal deploy files (config/deploy.yml, CI, hooks)",
    "  --regen                Regenerate derived deploy artifacts from current scaffold sources",
    "",
    "Secret push / cert bootstrap options:",
    "  --push-to <target>     Push target (only `gh` is supported)",
    "  --all                  Include extra keys from the local .env file",
    "  --only <keys>          Comma-separated allowlist (e.g. AI_API_KEY,HCLOUD_TOKEN)",
    "  --dry-run              Show what would be pushed without writing anything",
  );

  console.log(lines.join("\n"));
  return { success: true };
}

function runVersion(): CommandResult {
  console.log(`brain v${pkg.version}`);
  return { success: true };
}
