import { mkdirSync } from "fs";
import { join } from "path";
import { spawn, execSync } from "child_process";
import type { ParsedArgs } from "./parse-args";
import { scaffold } from "./commands/init";
import { start } from "./commands/start";
import { operate } from "./commands/operate";
import { operateRemote } from "./commands/operate-remote";
import { runEval } from "./commands/eval";
import { resolveRemoteUrl, resolveToken } from "./lib/remote-config";

export interface CommandResult {
  success: boolean;
  message?: string;
}

/**
 * Execute a parsed CLI command.
 */
export async function runCommand(
  parsed: ParsedArgs,
  cwd?: string,
): Promise<CommandResult> {
  const dir = cwd ?? process.cwd();

  switch (parsed.command) {
    case "init":
      return runInit(parsed, dir);
    case "start":
      return start(dir, { chat: false });
    case "chat":
      return start(dir, { chat: true });
    case "eval":
      return runEval(dir, process.argv.slice(2));
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

function runInit(parsed: ParsedArgs, cwd: string): CommandResult {
  const target = parsed.args[0];
  if (!target) {
    return {
      success: false,
      message: "Usage: brain init <directory> [--model rover]",
    };
  }

  const dir = join(cwd, target);
  mkdirSync(dir, { recursive: true });

  scaffold(dir, {
    model: parsed.flags.model ?? "rover",
    domain: parsed.flags.domain,
    contentRepo: parsed.flags["content-repo"],
    deploy: parsed.flags.deploy,
  });

  return {
    success: true,
    message: `Scaffolded brain instance in ${dir}`,
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
    "  tool <name>   Invoke a tool directly (for debugging)",
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
    "  --deploy               Include Kamal deploy files (deploy.yml, CI, hooks)",
  );

  console.log(lines.join("\n"));
  return { success: true };
}

function runVersion(): CommandResult {
  console.log("brain v0.1.0");
  return { success: true };
}
