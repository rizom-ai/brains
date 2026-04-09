import { basename } from "path";

export type PushTarget = "gh" | "1password";

export function normalizePushTarget(value?: string): PushTarget | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "1password" ||
    normalized === "onepassword" ||
    normalized === "op"
  ) {
    return "1password";
  }

  if (normalized === "gh" || normalized === "github") {
    return "gh";
  }

  throw new Error(`Unsupported --push-to value: ${value}`);
}

export function vaultNameForInstance(cwd: string): string {
  return `brain-${basename(cwd)}-prod`;
}

export function resolveOpToken(
  env: NodeJS.ProcessEnv,
  override?: string,
): string | undefined {
  return override ?? env["OP_TOKEN"] ?? env["OP_SERVICE_ACCOUNT_TOKEN"];
}
