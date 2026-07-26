import packageJson from "../package.json";

import type { FetchLike } from "@brains/deploy-support/origin-ca";
import {
  createCommandRegistry,
  defineCommand,
  getBooleanFlag,
  getStringFlag,
  renderHelp,
  renderUsage,
  type CommandDefinition,
  type CommandInfo,
  type FlagDefinition,
  type FlagDefinitions,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";
import { runPilotAgeKeyBootstrap } from "./age-key-bootstrap";
import { runPilotCertBootstrap } from "./cert-bootstrap";
import { initPilotRepo } from "./init";
import type { LoadPilotRegistryOptions } from "./load-registry";
import {
  createObservedStatusResolver,
  type LookupHost,
} from "./observed-status";
import { onboardUser } from "./onboard-user";
import { reconcileAll } from "./reconcile-all";
import { reconcileCohort } from "./reconcile-cohort";
import { writeUsersTable } from "./render-users-table";
import { encryptPilotSecrets } from "./secrets-encrypt";
import { pushPilotSecrets } from "./secrets-push";
import { type RunCommand as OpsRunCommand } from "./run-subprocess";
import { runPilotSshKeyBootstrap, type SshKeygen } from "./ssh-key-bootstrap";
import { addPilotUser } from "./user-add";
import type { UserRunner } from "./user-runner";
import { verifyPilotUser } from "./verify-user";

export interface CommandResult {
  success: boolean;
  message?: string;
}

export interface CommandDependencies extends LoadPilotRegistryOptions {
  runner?: UserRunner;
  env?: NodeJS.ProcessEnv | undefined;
  logger?: ((message: string) => void) | undefined;
  fetchImpl?: FetchLike | undefined;
  lookupHost?: LookupHost | undefined;
  bootstrapRunCommand?: OpsRunCommand | undefined;
  sshKeygen?: SshKeygen | undefined;
}

type OpsCommand = CommandDefinition<CommandDependencies, CommandResult>;

const CLI_NAME = "brains-ops";

const pushToFlag: FlagDefinition = {
  type: "string",
  placeholder: "<target>",
  description: "Push target (`gh` or `github`)",
};

const dryRunFlag: FlagDefinition = {
  type: "boolean",
  description: "Show what would happen without writing anything",
};

function usageFailure(command: CommandInfo): CommandResult {
  return { success: false, message: renderUsage(CLI_NAME, command) };
}

const init: OpsCommand = defineCommand({
  name: "init",
  usage: "<repo>",
  description: "Create a pilot repo skeleton",
  run: async ({ args }): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(init);
    }

    await initPilotRepo(repo);
    return {
      success: true,
      message: `Initialized ${repo}`,
    };
  },
});

const render: OpsCommand = defineCommand({
  name: "render",
  usage: "<repo>",
  description: "Render the observed users table to views/users.md",
  run: async ({ args }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(render);
    }

    const resolveStatus =
      dependencies.resolveStatus ??
      createObservedStatusResolver({
        ...(dependencies.fetchImpl
          ? { fetchImpl: dependencies.fetchImpl }
          : {}),
        ...(dependencies.lookupHost
          ? { lookupHost: dependencies.lookupHost }
          : {}),
      });

    await writeUsersTable(repo, { resolveStatus });
    return {
      success: true,
      message: `Rendered ${repo}/views/users.md`,
    };
  },
});

const userAdd: OpsCommand = defineCommand({
  name: "user:add",
  usage: "<repo> <handle> --cohort <cohort>",
  description: "Add a user to a cohort",
  flags: {
    cohort: {
      type: "string",
      placeholder: "<cohort>",
      description: "Cohort the user joins",
    },
    "anchor-id": {
      type: "string",
      placeholder: "<id>",
      description: "Discord anchor user id stored on the user record",
    },
  },
  run: async ({ args, flags }): Promise<CommandResult> => {
    const repo = args[0];
    const handle = args[1];
    const cohort = getStringFlag(flags, "cohort");
    if (!repo || !handle || !cohort) {
      return usageFailure(userAdd);
    }

    const anchorId = getStringFlag(flags, "anchor-id");
    await addPilotUser(repo, handle, {
      cohort,
      ...(anchorId ? { anchorId } : {}),
    });
    return {
      success: true,
      message: `Added ${handle} to ${cohort}`,
    };
  },
});

const onboard: OpsCommand = defineCommand({
  name: "onboard",
  usage: "<repo> <handle>",
  description: "Generate a user's brain.yaml and .env",
  run: async ({ args }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    const handle = args[1];
    if (!repo || !handle) {
      return usageFailure(onboard);
    }

    await onboardUser(repo, handle, dependencies.runner, {
      ...(dependencies.env ? { env: dependencies.env } : {}),
    });
    return {
      success: true,
      message: `Onboarded ${handle}`,
    };
  },
});

const ageKeyBootstrap: OpsCommand = defineCommand({
  name: "age-key:bootstrap",
  usage: "<repo>",
  description: "Generate the pilot age key and optional GitHub secret",
  flags: { "push-to": pushToFlag },
  run: async ({ args, flags }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(ageKeyBootstrap);
    }

    const pushTo = getStringFlag(flags, "push-to");
    return runPilotAgeKeyBootstrap(repo, {
      ...(dependencies.logger ? { logger: dependencies.logger } : {}),
      ...(pushTo ? { pushTo } : {}),
      ...(dependencies.bootstrapRunCommand
        ? { runCommand: dependencies.bootstrapRunCommand }
        : {}),
    });
  },
});

const sshKeyBootstrap: OpsCommand = defineCommand({
  name: "ssh-key:bootstrap",
  usage: "<repo>",
  description: "Bootstrap a deploy SSH key and optional GitHub secret",
  flags: { "push-to": pushToFlag },
  run: async ({ args, flags }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(sshKeyBootstrap);
    }

    const pushTo = getStringFlag(flags, "push-to");
    return runPilotSshKeyBootstrap(repo, {
      ...(dependencies.env ? { env: dependencies.env } : {}),
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.logger ? { logger: dependencies.logger } : {}),
      ...(pushTo ? { pushTo } : {}),
      ...(dependencies.bootstrapRunCommand
        ? { runCommand: dependencies.bootstrapRunCommand }
        : {}),
      ...(dependencies.sshKeygen ? { sshKeygen: dependencies.sshKeygen } : {}),
    });
  },
});

const certBootstrap: OpsCommand = defineCommand({
  name: "cert:bootstrap",
  usage: "<repo>",
  description: "Issue Cloudflare Origin CA certificates for pilot users",
  flags: {
    handle: {
      type: "string",
      placeholder: "<handle>",
      description: "Only issue the certificate for this user handle",
    },
    "push-to": pushToFlag,
  },
  run: async ({ args, flags }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(certBootstrap);
    }

    const handle = getStringFlag(flags, "handle");
    const pushTo = getStringFlag(flags, "push-to");
    return runPilotCertBootstrap(repo, {
      ...(dependencies.env ? { env: dependencies.env } : {}),
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.logger ? { logger: dependencies.logger } : {}),
      ...(handle ? { handle } : {}),
      ...(pushTo ? { pushTo } : {}),
      ...(dependencies.bootstrapRunCommand
        ? { runCommand: dependencies.bootstrapRunCommand }
        : {}),
    });
  },
});

const secretsPush: OpsCommand = defineCommand({
  name: "secrets:push",
  usage: "<repo>",
  description: "Push env-backed local secrets to GitHub Secrets",
  flags: { "dry-run": dryRunFlag },
  run: async ({ args, flags }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(secretsPush);
    }

    const result = await pushPilotSecrets(repo, {
      env: dependencies.env,
      logger: dependencies.logger,
      dryRun: getBooleanFlag(flags, "dry-run"),
    });
    return {
      success: true,
      message: result.dryRun
        ? `Dry run: would push ${result.pushedKeys.length} secrets`
        : `Pushed ${result.pushedKeys.length} secrets`,
    };
  },
});

const secretsEncrypt: OpsCommand = defineCommand({
  name: "secrets:encrypt",
  usage: "<repo> <handle>",
  description: "Encrypt pilot secrets for a user with age",
  flags: { "dry-run": dryRunFlag },
  run: async ({ args, flags }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    const handle = args[1];
    if (!repo || !handle) {
      return usageFailure(secretsEncrypt);
    }

    const result = await encryptPilotSecrets(repo, handle, {
      env: dependencies.env,
      logger: dependencies.logger,
      dryRun: getBooleanFlag(flags, "dry-run"),
    });
    return {
      success: true,
      message: result.dryRun
        ? `Dry run: would encrypt ${result.encryptedKeys.length} secrets for ${handle}`
        : `Encrypted ${result.encryptedKeys.length} secrets for ${handle}`,
    };
  },
});

const verifyUser: OpsCommand = defineCommand({
  name: "verify-user",
  usage: "<repo> <handle>",
  description: "Probe a deployed user's endpoints",
  run: async ({ args }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    const handle = args[1];
    if (!repo || !handle) {
      return usageFailure(verifyUser);
    }

    const result = await verifyPilotUser(repo, handle, {
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.logger ? { logger: dependencies.logger } : {}),
    });
    const passedSummary =
      result.checks.length > 0 ? result.checks.join(", ") : "none";
    if (result.failedChecks.length > 0) {
      const failedDetail = result.failedChecks
        .map((failure) => `  ${failure.name}: ${failure.message}`)
        .join("\n");
      return {
        success: false,
        message: `Verified ${result.handle} (${result.preset}) at https://${result.domain}: passed ${passedSummary}; failed:\n${failedDetail}`,
      };
    }
    return {
      success: true,
      message: `Verified ${result.handle} (${result.preset}) at https://${result.domain}: ${passedSummary}`,
    };
  },
});

const reconcileCohortCommand: OpsCommand = defineCommand({
  name: "reconcile-cohort",
  usage: "<repo> <cohort>",
  description: "Reconcile all users in a cohort",
  run: async ({ args }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    const cohort = args[1];
    if (!repo || !cohort) {
      return usageFailure(reconcileCohortCommand);
    }

    await reconcileCohort(repo, cohort, dependencies.runner, {
      ...(dependencies.env ? { env: dependencies.env } : {}),
    });
    return {
      success: true,
      message: `Reconciled cohort ${cohort}`,
    };
  },
});

const reconcileAllCommand: OpsCommand = defineCommand({
  name: "reconcile-all",
  usage: "<repo>",
  description: "Reconcile every cohort",
  run: async ({ args }, dependencies): Promise<CommandResult> => {
    const repo = args[0];
    if (!repo) {
      return usageFailure(reconcileAllCommand);
    }

    await reconcileAll(repo, dependencies.runner, {
      ...(dependencies.env ? { env: dependencies.env } : {}),
    });
    return {
      success: true,
      message: "Reconciled all cohorts",
    };
  },
});

const help: OpsCommand = defineCommand({
  name: "help",
  description: "Show this help message",
  run: (): CommandResult => ({
    success: true,
    message: renderHelp({
      cliName: CLI_NAME,
      intro: "brains-ops — operator CLI for private brain fleet repos",
      commands,
      globalFlags,
    }),
  }),
});

const version: OpsCommand = defineCommand({
  name: "version",
  description: "Show version",
  run: (): CommandResult => ({
    success: true,
    message: `brains-ops ${packageJson.version}`,
  }),
});

export const globalFlags: FlagDefinitions = {
  help: { type: "boolean", short: "h", description: "Show help" },
  version: { type: "boolean", short: "v", description: "Show version" },
};

export const commands: readonly CommandDefinition<
  CommandDependencies,
  CommandResult
>[] = [
  init,
  render,
  userAdd,
  onboard,
  ageKeyBootstrap,
  sshKeyBootstrap,
  certBootstrap,
  secretsPush,
  secretsEncrypt,
  verifyUser,
  reconcileCohortCommand,
  reconcileAllCommand,
  help,
  version,
];

const registry = createCommandRegistry(commands);

export async function runCommand(
  parsed: ParsedCliArgs,
  dependencies: CommandDependencies = {},
): Promise<CommandResult> {
  const command = registry.get(parsed.command);
  if (!command) {
    return {
      success: false,
      message: `Unknown command: ${parsed.command}`,
    };
  }

  return command.run({ args: parsed.args, flags: parsed.flags }, dependencies);
}
