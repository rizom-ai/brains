export function nextCronOccurrence(
  expression: string,
  relativeTo: Date | number,
  timezone?: string,
): Date {
  const next = Bun.cron.parse(
    expression,
    relativeTo,
    timezone ? { tz: timezone } : undefined,
  );
  if (next === null) {
    throw new Error(
      `Cron expression ${JSON.stringify(expression)} has no future occurrences`,
    );
  }
  return next;
}

export function validateCronExpression(expression: string): void {
  nextCronOccurrence(expression, Date.now());
}
