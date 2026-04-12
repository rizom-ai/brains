import packageJson from "../package.json";

import { initPilotRepo } from "./init";
import type { LoadPilotRegistryOptions } from "./load-registry";
import { onboardUser } from "./onboard-user";
import type { ParsedArgs } from "./parse-args";
import { reconcileAll } from "./reconcile-all";
import { reconcileCohort } from "./reconcile-cohort";
import type { UserRunner } from "./reconcile-lib";
import { writeUsersTable } from "./render-users-table";

export interface CommandResult {
  success: boolean;
  message?: string;
}

export interface CommandDependencies extends LoadPilotRegistryOptions {
  runner?: UserRunner;
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

      await writeUsersTable(repo, {
        ...(dependencies.resolveStatus
          ? { resolveStatus: dependencies.resolveStatus }
          : {}),
      });
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

      if (!dependencies.runner) {
        return {
          success: false,
          message:
            "brains-ops onboard requires an operator runner to perform repo and deploy reconciliation",
        };
      }

      await onboardUser(repo, handle, dependencies.runner);
      return {
        success: true,
        message: `Onboarded ${handle}`,
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

      if (!dependencies.runner) {
        return {
          success: false,
          message:
            "brains-ops reconcile-cohort requires an operator runner to perform repo and deploy reconciliation",
        };
      }

      await reconcileCohort(repo, cohort, dependencies.runner);
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

      if (!dependencies.runner) {
        return {
          success: false,
          message:
            "brains-ops reconcile-all requires an operator runner to perform repo and deploy reconciliation",
        };
      }

      await reconcileAll(repo, dependencies.runner);
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
          "  onboard <repo> <handle>          requires operator runner",
          "  reconcile-cohort <repo> <cohort> requires operator runner",
          "  reconcile-all <repo>            requires operator runner",
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
