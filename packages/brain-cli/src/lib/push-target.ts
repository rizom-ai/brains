export type PushTarget = "gh" | "bitwarden";

export function normalizePushTarget(value?: string): PushTarget | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "gh" || normalized === "github") {
    return "gh";
  }

  if (normalized === "bw" || normalized === "bitwarden") {
    return "bitwarden";
  }

  throw new Error(`Unsupported --push-to value: ${value}`);
}
