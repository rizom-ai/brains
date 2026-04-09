export type PushTarget = "gh";

export function normalizePushTarget(value?: string): PushTarget | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "gh" || normalized === "github") {
    return "gh";
  }

  throw new Error(`Unsupported --push-to value: ${value}`);
}
