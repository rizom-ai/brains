import type { ParsedArgs } from "./parse-args";
import { scaffold } from "./commands/init";

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
    case "help":
      return runHelp();
    case "version":
      return runVersion();
    default:
      return { success: false, message: `Unknown command: ${parsed.command}` };
  }
}

function runInit(parsed: ParsedArgs, dir: string): CommandResult {
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

function runHelp(): CommandResult {
  const help = `brain — CLI for managing brain instances

Usage: brain <command> [options]

Commands:
  init          Scaffold a new brain instance
  help          Show this help message

Options:
  --help, -h    Show help
  --version, -v Show version

Init options:
  --model <name>         Brain model (default: rover)
  --domain <domain>      Domain (default: {model}.rizom.ai)
  --content-repo <repo>  Content repo (e.g. github:user/brain-data)
`;

  console.log(help);
  return { success: true };
}

function runVersion(): CommandResult {
  console.log("brain v0.1.0");
  return { success: true };
}
