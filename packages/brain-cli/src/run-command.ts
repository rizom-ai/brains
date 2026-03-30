import { mkdirSync } from "fs";
import { join } from "path";
import type { ParsedArgs } from "./parse-args";
import { scaffold } from "./commands/init";
import { start } from "./commands/start";
import { operate } from "./commands/operate";

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
    case "tool":
      return runRawTool(parsed, dir);
    case "help":
      return runHelp(dir);
    case "version":
      return runVersion();
    default:
      // All other commands go through the tool registry
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

  const spawnArgs = ["bun", "run", runner.path, "--tool", toolName];
  if (inputJson) {
    spawnArgs.push("--tool-input", inputJson);
  }

  const proc = Bun.spawn(spawnArgs, {
    cwd: dir,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const exitCode = await proc.exited;
  return {
    success: exitCode === 0,
    ...(exitCode !== 0
      ? { message: `Tool failed with exit code ${exitCode}` }
      : {}),
  };
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
        const proc = Bun.spawn(
          ["bun", "run", runner.path, "--list-cli-commands"],
          { cwd: dir, stdout: "pipe", stderr: "ignore", env: process.env },
        );
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;

        if (exitCode === 0 && output.trim()) {
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
    "Init options:",
    "  --model <name>         Brain model (default: rover)",
    "  --domain <domain>      Domain (default: {model}.rizom.ai)",
    "  --content-repo <repo>  Content repo (e.g. github:user/brain-data)",
  );

  console.log(lines.join("\n"));
  return { success: true };
}

function runVersion(): CommandResult {
  console.log("brain v0.1.0");
  return { success: true };
}
