import packageJson from "../package.json";

import type { FetchLike } from "@brains/utils/origin-ca";
import { runPilotAgeKeyBootstrap } from "./age-key-bootstrap";
import { runPilotCertBootstrap } from "./cert-bootstrap";
import { initPilotRepo } from "./init";
import type { LoadPilotRegistryOptions } from "./load-registry";
import {
  createObservedStatusResolver,
  type LookupHost,
} from "./observed-status";
import { onboardUser } from "./onboard-user";
import type { ParsedArgs } from "./parse-args";
import { reconcileAll } from "./reconcile-all";
import { reconcileCohort } from "./reconcile-cohort";
import { writeUsersTable } from "./render-users-table";
import { encryptPilotSecrets } from "./secrets-encrypt";
import { type RunCommand as OpsRunCommand } from "./run-subprocess";
import { runPilotSshKeyBootstrap, type SshKeygen } from "./ssh-key-bootstrap";
import type { UserRunner } from "./user-runner";

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

export async function runCommand(
  parsed: ParsedArgs,
  dependencies: CommandDependencies = {},
): Promise<CommandResult> {
  switch (parsed.command) {
    case "init": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops init <repo>",
        };
      }

      await initPilotRepo(repo);
      return {
        success: true,
        message: `Initialized ${repo}`,
      };
    }

    case "render": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops render <repo>",
        };
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
    }

    case "onboard": {
      const repo = parsed.args[0];
      const handle = parsed.args[1];
      if (!repo || !handle) {
        return {
          success: false,
          message: "Usage: brains-ops onboard <repo> <handle>",
        };
      }

      await onboardUser(repo, handle, dependencies.runner, {
        ...(dependencies.env ? { env: dependencies.env } : {}),
      });
      return {
        success: true,
        message: `Onboarded ${handle}`,
      };
    }

    case "age-key:bootstrap": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops age-key:bootstrap <repo>",
        };
      }

      return runPilotAgeKeyBootstrap(repo, {
        ...(dependencies.logger ? { logger: dependencies.logger } : {}),
        ...(parsed.flags.pushTo ? { pushTo: parsed.flags.pushTo } : {}),
        ...(dependencies.bootstrapRunCommand
          ? { runCommand: dependencies.bootstrapRunCommand }
          : {}),
      });
    }

    case "ssh-key:bootstrap": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops ssh-key:bootstrap <repo>",
        };
      }

      return runPilotSshKeyBootstrap(repo, {
        ...(dependencies.env ? { env: dependencies.env } : {}),
        ...(dependencies.fetchImpl
          ? { fetchImpl: dependencies.fetchImpl }
          : {}),
        ...(dependencies.logger ? { logger: dependencies.logger } : {}),
        ...(parsed.flags.pushTo ? { pushTo: parsed.flags.pushTo } : {}),
        ...(dependencies.bootstrapRunCommand
          ? { runCommand: dependencies.bootstrapRunCommand }
          : {}),
        ...(dependencies.sshKeygen
          ? { sshKeygen: dependencies.sshKeygen }
          : {}),
      });
    }

    case "cert:bootstrap": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops cert:bootstrap <repo>",
        };
      }

      return runPilotCertBootstrap(repo, {
        ...(dependencies.env ? { env: dependencies.env } : {}),
        ...(dependencies.fetchImpl
          ? { fetchImpl: dependencies.fetchImpl }
          : {}),
        ...(dependencies.logger ? { logger: dependencies.logger } : {}),
        ...(parsed.flags.pushTo ? { pushTo: parsed.flags.pushTo } : {}),
        ...(dependencies.bootstrapRunCommand
          ? { runCommand: dependencies.bootstrapRunCommand }
          : {}),
      });
    }

    case "secrets:encrypt": {
      const repo = parsed.args[0];
      const handle = parsed.args[1];
      if (!repo || !handle) {
        return {
          success: false,
          message: "Usage: brains-ops secrets:encrypt <repo> <handle>",
        };
      }

      const result = await encryptPilotSecrets(repo, handle, {
        env: dependencies.env,
        logger: dependencies.logger,
        dryRun: parsed.flags.dryRun,
      });
      return {
        success: true,
        message: result.dryRun
          ? `Dry run: would encrypt ${result.encryptedKeys.length} secrets for ${handle}`
          : `Encrypted ${result.encryptedKeys.length} secrets for ${handle}`,
      };
    }

    case "reconcile-cohort": {
      const repo = parsed.args[0];
      const cohort = parsed.args[1];
      if (!repo || !cohort) {
        return {
          success: false,
          message: "Usage: brains-ops reconcile-cohort <repo> <cohort>",
        };
      }

      await reconcileCohort(repo, cohort, dependencies.runner, {
        ...(dependencies.env ? { env: dependencies.env } : {}),
      });
      return {
        success: true,
        message: `Reconciled cohort ${cohort}`,
      };
    }

    case "reconcile-all": {
      const repo = parsed.args[0];
      if (!repo) {
        return {
          success: false,
          message: "Usage: brains-ops reconcile-all <repo>",
        };
      }

      await reconcileAll(repo, dependencies.runner, {
        ...(dependencies.env ? { env: dependencies.env } : {}),
      });
      return {
        success: true,
        message: "Reconciled all cohorts",
      };
    }

    case "help":
      return {
        success: true,
        message: [
          "brains-ops — operator CLI for private brain fleet repos",
          "",
          "Usage: brains-ops <command> [args]",
          "",
          "Commands:",
          "  init <repo>",
          "  render <repo>",
          "  onboard <repo> <handle>",
          "  age-key:bootstrap <repo>",
          "  ssh-key:bootstrap <repo>",
          "  cert:bootstrap <repo>",
          "  secrets:encrypt <repo> <handle>",
          "  reconcile-cohort <repo> <cohort>",
          "  reconcile-all <repo>",
          "  help",
        ].join("\n"),
      };

    case "version":
      return {
        success: true,
        message: `brains-ops ${packageJson.version}`,
      };

    default:
      return {
        success: false,
        message: `Unknown command: ${parsed.command}`,
      };
  }
}
