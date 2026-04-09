import * as p from "@clack/prompts";
import type { ScaffoldOptions } from "../commands/init";

/**
 * Whether the current process can prompt the user.
 *
 * Non-TTY environments (CI, piped stdin/stdout, called from a subprocess)
 * cannot show interactive prompts and must use defaults / flags only.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/**
 * Walk the user through the questions needed to scaffold a runnable brain.
 *
 * Each question is skipped when the corresponding flag was already supplied,
 * so `brain init mybrain --ai-api-key=sk-... --content-repo=user/data` runs
 * end-to-end without any prompts even in interactive mode.
 *
 * Cancellation (Ctrl+C) at any prompt exits the process cleanly via clack's
 * `isCancel` check.
 */
export async function promptInitOptions(
  initial: ScaffoldOptions,
  targetDir: string,
): Promise<ScaffoldOptions> {
  p.intro(`Setting up brain in ${targetDir}`);

  const result: ScaffoldOptions = { ...initial };

  // 1. AI API key — required, written to .env so the brain can boot
  if (!result.apiKey) {
    const apiKey = await p.password({
      message: "AI API key (OpenAI / Anthropic / Google)",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "An AI API key is required to boot the brain.";
        }
        return undefined;
      },
    });

    if (p.isCancel(apiKey)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    result.apiKey = apiKey;
  }

  // 2. Content git repo — optional, controls whether brain.yaml's git block
  //    is uncommented and which repo it points at
  if (!result.contentRepo) {
    const enableGit = await p.confirm({
      message: "Sync brain content to a git repository?",
      initialValue: false,
    });

    if (p.isCancel(enableGit)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (enableGit) {
      const repo = await p.text({
        message: "Git repo (e.g. user/brain-data)",
        placeholder: "user/brain-data",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Repo name is required when git sync is enabled.";
          }
          if (!/^[\w.-]+\/[\w.-]+$/.test(value.trim())) {
            return "Use the format owner/name (e.g. user/brain-data).";
          }
          return undefined;
        },
      });

      if (p.isCancel(repo)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      result.contentRepo = repo.trim();
    }
  }

  // Secret backend defaults to "none" (env-vars-only resolution via
  // varlock). Operators who want a varlock plugin pass --backend <name>
  // explicitly; no interactive prompt because the default Just Works
  // and exposing the choice up front adds friction for the common path.

  p.outro("Ready to scaffold.");

  return result;
}
