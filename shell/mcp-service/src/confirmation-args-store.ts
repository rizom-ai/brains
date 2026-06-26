function stableForConfirmation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableForConfirmation);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stableForConfirmation(entryValue)]),
  );
}

export type ConfirmationArgsValidationResult =
  | { status: "ok" }
  | { status: "missing" }
  | { status: "mismatch" };

export class ConfirmationArgsStore {
  private readonly pendingArgs = new Map<string, string>();

  create<TArgs>(buildArgs: (confirmationToken: string) => TArgs): TArgs {
    const confirmationToken = crypto.randomUUID();
    const args = buildArgs(confirmationToken);
    this.pendingArgs.set(confirmationToken, this.serialize(args));
    return args;
  }

  validate(
    confirmationToken: string | undefined,
    args: unknown,
  ): ConfirmationArgsValidationResult {
    const expectedArgs = confirmationToken
      ? this.pendingArgs.get(confirmationToken)
      : undefined;
    if (!confirmationToken || !expectedArgs) {
      return { status: "missing" };
    }
    this.pendingArgs.delete(confirmationToken);
    if (this.serialize(args) !== expectedArgs) {
      return { status: "mismatch" };
    }
    return { status: "ok" };
  }

  private serialize(value: unknown): string {
    return JSON.stringify(stableForConfirmation(value));
  }
}
