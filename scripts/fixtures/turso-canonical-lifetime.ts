/** Test-only ownership: a runner timeout is not completion of the test's finally blocks. */
export class CanonicalTestLifetime {
  private stopping = false;
  private readonly work: Promise<{ error: unknown } | undefined>[] = [];
  private joined: Promise<void> | undefined;

  public assertOpen(): void {
    if (this.stopping) throw new Error("Canonical test lifetime is retiring");
  }

  public run(use: () => Promise<void>): Promise<void> {
    this.assertOpen();
    const work = Promise.resolve().then(use);
    // Own completion before invoking user code. The runner observes the original
    // rejection; join also observes late failures after the runner times out.
    this.work.push(
      work.then(
        () => undefined,
        (error: unknown) => ({ error }),
      ),
    );
    return work;
  }

  public join(): Promise<void> {
    this.stopping = true;
    this.joined ??= this.finish();
    return this.joined;
  }

  private async finish(): Promise<void> {
    const outcomes = await Promise.all(this.work);
    const failures: unknown[] = [];
    for (const outcome of outcomes) if (outcome) failures.push(outcome.error);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        "Canonical test work failed during retirement",
        { cause: failures[0] },
      );
  }
}
