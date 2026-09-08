/** Drain a cleanup stack in reverse order, even when individual releases fail. */
export async function runCleanups(
  cleanups: Array<() => void | Promise<void>>,
): Promise<void> {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Plugin cleanup failed");
}
