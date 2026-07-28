import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import {
  createCommandRegistry,
  defineCommand,
  getBooleanFlag,
  getStringFlag,
  renderCommandFlagSections,
  renderCommandList,
  renderFlagList,
  resolveSubcommand,
  type CommandDefinition,
  type FlagDefinition,
  type FlagDefinitions,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";
import { spawnBunRunner } from "./lib/spawn-bun-runner";
import pkg from "../package.json" with { type: "json" };
import { scaffold, type ScaffoldOptions } from "./commands/init";
import { promptInitOptions, isInteractive } from "./lib/init-prompts";
import { start, findRunner } from "./commands/start";
import { operate } from "./commands/operate";
import { operateRemote } from "./commands/operate-remote";
import { runEval } from "./commands/eval";
import { pin } from "./commands/pin";
import { resolveRemoteUrl, resolveToken } from "./lib/remote-config";
import { diagnostics } from "./commands/diagnostics";
import { runCertBootstrap } from "./commands/cert-bootstrap";
import { runSecretsPush } from "./commands/secrets-push";
import { runSshKeyBootstrap } from "./commands/ssh-key-bootstrap";
import { resetAuthPasskeys } from "./commands/auth-reset-passkeys";
import { reinitializeAuthAccess } from "./commands/auth-reinitialize-access";
import { BRAIN_RECIPE_NAMES, isBrainRecipeName } from "./lib/brain-recipes";
import type { CommandResult } from "./lib/command-result";

export type { CommandResult } from "./lib/command-result";

type BrainCommand = CommandDefinition<string, CommandResult>;

const pushToFlag: FlagDefinition = {
  type: "string",
  placeholder: "<target>",
  description: "Push target (`gh`, `github`, `bw`, or `bitwarden`)",
};

const authRecoveryFlags: FlagDefinitions = {
  "storage-dir": {
    type: "string",
    placeholder: "<dir>",
    description:
      "Auth storage directory for recovery commands (default: ./data/auth)",
  },
  yes: {
    type: "boolean",
    description: "Confirm destructive local recovery commands",
  },
};

const startupCheckFlag: FlagDefinition = {
  type: "boolean",
  description:
    "Boot through plugin ready hooks, then exit without daemons/jobs",
};

const initCommand: BrainCommand = defineCommand({
  name: "init",
  usage: "<dir>",
  description: "Scaffold a new brain instance",
  flags: {
    recipe: {
      type: "string",
      placeholder: "<name>",
      description:
        "Scaffold recipe: minimal, personal, team, commerce (default: personal)",
    },
    domain: {
      type: "string",
      placeholder: "<domain>",
      description: "Domain (default: {directory}.rizom.ai)",
    },
    "content-repo": {
      type: "string",
      placeholder: "<repo>",
      description: "Content repo (e.g. github:user/brain-data)",
    },
    backend: {
      type: "string",
      placeholder: "<name>",
      description:
        "Secret backend (default: none — env vars resolved by varlock)",
    },
    "ai-api-key": {
      type: "string",
      placeholder: "<key>",
      description: "AI API key written to .env (skips the prompt)",
    },
    deploy: {
      type: "boolean",
      description: "Include Kamal deploy files (config/deploy.yml, CI, hooks)",
    },
    regen: {
      type: "boolean",
      description:
        "Regenerate deploy scaffolding from current scaffold sources",
    },
    "no-interactive": {
      type: "boolean",
      description: "Skip interactive prompts (use flag values as-is)",
    },
  },
  run: async ({ args, flags }, cwd): Promise<CommandResult> => {
    const target = args[0];
    if (!target) {
      return {
        success: false,
        message:
          "Usage: brain init <directory> [--recipe personal] [--backend none] [--deploy] [--regen]",
      };
    }

    const dir = join(cwd, target);
    mkdirSync(dir, { recursive: true });

    // Build the initial options from flags. These act as defaults / pre-filled
    // values when prompting, and as the complete config when running
    // non-interactively.
    const rawRecipe = getStringFlag(flags, "recipe") ?? "personal";
    if (!isBrainRecipeName(rawRecipe)) {
      return {
        success: false,
        message: `Unknown recipe "${rawRecipe}". Available: ${BRAIN_RECIPE_NAMES.join(", ")}`,
      };
    }

    const initialOptions: ScaffoldOptions = {
      recipe: rawRecipe,
      domain: getStringFlag(flags, "domain"),
      contentRepo: getStringFlag(flags, "content-repo"),
      backend: getStringFlag(flags, "backend"),
      deploy: getBooleanFlag(flags, "deploy"),
      regen: getBooleanFlag(flags, "regen"),
      apiKey: getStringFlag(flags, "ai-api-key"),
    };

    // Prompt for missing values when running interactively. Tests and CI
    // pass --no-interactive (or run in a non-TTY environment) to skip prompts.
    const interactive =
      !getBooleanFlag(flags, "no-interactive") && isInteractive();

    const finalOptions = interactive
      ? await promptInitOptions(initialOptions, dir)
      : initialOptions;

    scaffold(dir, finalOptions);

    return {
      success: true,
      message: `Brain instance ready in ${dir}`,
    };
  },
});

const startCommand: BrainCommand = defineCommand({
  name: "start",
  description: "Start the brain (all daemons)",
  flags: { "startup-check": startupCheckFlag },
  run: ({ flags }, dir): Promise<CommandResult> =>
    start(dir, {
      chat: false,
      ...(getBooleanFlag(flags, "startup-check")
        ? { mode: "startup-check" }
        : {}),
    }),
});

const chatCommand: BrainCommand = defineCommand({
  name: "chat",
  description: "Start with interactive chat REPL",
  flags: { "startup-check": startupCheckFlag },
  run: ({ flags }, dir): Promise<CommandResult> =>
    start(dir, {
      chat: true,
      ...(getBooleanFlag(flags, "startup-check")
        ? { mode: "startup-check" }
        : {}),
    }),
});

const evalCommand: BrainCommand = defineCommand({
  name: "eval",
  description: "Run AI evaluations (pass-through to brain-eval)",
  run: (_invocation, dir): Promise<CommandResult> =>
    runEval(dir, process.argv.slice(2)),
});

const pinCommand: BrainCommand = defineCommand({
  name: "pin",
  description: "Pin @rizom/brain version (creates package.json, installs)",
  run: (_invocation, dir): CommandResult => pin(dir),
});

const diagnosticsCommand: BrainCommand = defineCommand({
  name: "diagnostics",
  usage: "<subcommand>",
  description: "Run deployment diagnostics via the brain runner",
  run: ({ args }, dir): Promise<CommandResult> =>
    diagnostics(dir, args[0] ?? ""),
});

const certBootstrap: BrainCommand = defineCommand({
  name: "cert:bootstrap",
  description: "Issue Cloudflare Origin CA cert for brain.yaml domain",
  flags: { "push-to": pushToFlag },
  run: ({ flags }, dir): Promise<CommandResult> =>
    runCertBootstrap(dir, {
      pushTo: getStringFlag(flags, "push-to"),
    }),
});

const secretsPush: BrainCommand = defineCommand({
  name: "secrets:push",
  description: "Push env-backed local secrets to GitHub or Bitwarden",
  flags: {
    "push-to": pushToFlag,
    all: {
      type: "boolean",
      description: "Include extra keys from the local .env file",
    },
    only: {
      type: "string",
      placeholder: "<keys>",
      description: "Comma-separated allowlist (e.g. AI_API_KEY,HCLOUD_TOKEN)",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be pushed without writing anything",
    },
  },
  run: ({ flags }, dir): Promise<CommandResult> =>
    runSecretsPush(dir, {
      pushTo: getStringFlag(flags, "push-to"),
      all: getBooleanFlag(flags, "all"),
      only: getStringFlag(flags, "only"),
      dryRun: getBooleanFlag(flags, "dry-run"),
    }),
});

const sshKeyBootstrap: BrainCommand = defineCommand({
  name: "ssh-key:bootstrap",
  description: "Bootstrap a Hetzner deploy SSH key and optional GitHub secret",
  flags: { "push-to": pushToFlag },
  run: ({ flags }, dir): Promise<CommandResult> =>
    runSshKeyBootstrap(dir, {
      pushTo: getStringFlag(flags, "push-to"),
    }),
});

const authResetPasskeys: BrainCommand = defineCommand({
  name: "auth:reset-passkeys",
  usage: "--yes",
  description: "Clear local auth passkeys and active OAuth state",
  flags: authRecoveryFlags,
  run: ({ flags }, dir): Promise<CommandResult> =>
    resetAuthPasskeys(dir, {
      storageDir: getStringFlag(flags, "storage-dir"),
      yes: getBooleanFlag(flags, "yes"),
    }),
});

const authReinitializeAccess: BrainCommand = defineCommand({
  name: "auth:reinitialize-access",
  usage: "--yes",
  description: "Reapply exact access from brain.yaml",
  flags: authRecoveryFlags,
  run: ({ flags }, dir): Promise<CommandResult> =>
    reinitializeAuthAccess(dir, {
      storageDir: getStringFlag(flags, "storage-dir"),
      yes: getBooleanFlag(flags, "yes"),
    }),
});

const configMigrate: BrainCommand = defineCommand({
  name: "config:migrate",
  description: "Preview model/preset → canonical bundle migration (no writes)",
  run: async (_invocation, dir): Promise<CommandResult> => {
    const { runConfigMigrationPreview } =
      await import("./commands/config-migrate");
    return runConfigMigrationPreview(dir);
  },
});

const toolCommand: BrainCommand = defineCommand({
  name: "tool",
  usage: "<name> [input-json]",
  description: "Invoke a tool directly (for debugging)",
  run: async ({ args }, dir): Promise<CommandResult> => {
    const toolName = args[0];
    const inputJson = args[1];

    if (!toolName) {
      return {
        success: false,
        message: 'Usage: brain tool <toolName> [\'{"key": "value"}\']',
      };
    }

    const runner = findRunner(dir);
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

    return spawnBunRunner({
      cwd: dir,
      args: runnerArgs,
      failureMessage: (code) => `Tool failed with exit code ${code}`,
    });
  },
});

const helpCommand: BrainCommand = defineCommand({
  name: "help",
  description: "Show this help message",
  run: (_invocation, dir): Promise<CommandResult> => runHelp(dir),
});

const versionCommand: BrainCommand = defineCommand({
  name: "version",
  description: "Show version",
  run: (): CommandResult => {
    console.log(`brain v${pkg.version}`);
    return { success: true };
  },
});

export const globalFlags: FlagDefinitions = {
  help: { type: "boolean", short: "h", description: "Show help" },
  version: { type: "boolean", short: "v", description: "Show version" },
  remote: {
    type: "string",
    placeholder: "<url>",
    description: "Query a deployed brain via MCP HTTP",
  },
  token: {
    type: "string",
    placeholder: "<token>",
    description: "Auth token (or set BRAIN_REMOTE_TOKEN)",
  },
  preview: {
    type: "boolean",
    description:
      "Passed through to brain commands (e.g. `brain build --preview`)",
  },
  outputDir: {
    type: "string",
    placeholder: "<dir>",
    description: "Passed through to brain commands that write output",
  },
};

export const commands: readonly CommandDefinition<string, CommandResult>[] = [
  initCommand,
  startCommand,
  chatCommand,
  evalCommand,
  pinCommand,
  diagnosticsCommand,
  certBootstrap,
  secretsPush,
  sshKeyBootstrap,
  authResetPasskeys,
  authReinitializeAccess,
  configMigrate,
  toolCommand,
  helpCommand,
  versionCommand,
];

const registry = createCommandRegistry(commands);

/**
 * Execute a parsed CLI command.
 *
 * Both `brain cert bootstrap` and `brain cert:bootstrap` reach the same
 * handler — `resolveSubcommand` collapses the space form onto the colon-form
 * registry name. Commands that aren't registered fall through to the brain's
 * dynamic tool registry (local boot, or remote via `--remote`).
 */
export async function runCommand(
  parsed: ParsedCliArgs,
  dir: string,
): Promise<CommandResult> {
  const resolved = resolveSubcommand(registry, parsed.command, parsed.args);
  const command = registry.get(resolved.name);
  if (command) {
    return command.run({ args: resolved.args, flags: parsed.flags }, dir);
  }

  // Remote mode — query deployed brain via MCP HTTP
  const remote = getStringFlag(parsed.flags, "remote");
  if (remote) {
    const url = resolveRemoteUrl(remote);
    const token = resolveToken(getStringFlag(parsed.flags, "token"));
    return operateRemote(url, parsed.command, parsed.args, parsed.flags, token);
  }

  // Local mode — boot brain, invoke tool
  return operate(dir, parsed.command, parsed.args, parsed.flags);
}

async function runHelp(cwd?: string): Promise<CommandResult> {
  const lines = [
    "brain — CLI for managing brain instances",
    "",
    "Usage: brain <command> [options]",
    "",
    "Commands:",
    ...renderCommandList(commands),
  ];

  // If brain.yaml exists, discover CLI-enabled tools
  const dir = cwd ?? process.cwd();
  const hasBrainYaml = existsSync(join(dir, "brain.yaml"));

  if (hasBrainYaml) {
    const runner = findRunner(dir);
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

  lines.push("", "Options:", ...renderFlagList(globalFlags));
  lines.push(...renderCommandFlagSections(commands));

  console.log(lines.join("\n"));
  return { success: true };
}
