/**
 * Give the event loop a turn: timers that are due, such as a worker's
 * heartbeat, and pending I/O run before this resolves. Local libSQL answers
 * queries synchronously, so a loop of awaited statements is one unbroken
 * chain of microtasks that starves them; a long loop calls this between its
 * steps.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** How long work may run without the event loop turning before it yields. */
export const STARVATION_BUDGET_MS = 50;

/** When the event loop last turned, as far as a probe timer has seen. */
let turnedAt = performance.now();
let probing = false;

/** A zero-delay timer that can only fire once the loop has turned. */
function probeTurn(): void {
  if (probing) return;
  probing = true;
  setTimeout(() => {
    probing = false;
    turnedAt = performance.now();
  }, 0);
}

/**
 * Yield to the event loop only when it has not turned for `budgetMs`, so a
 * caller can check on every step of long work and pay for a turn only once
 * the work has starved timers and I/O that long.
 */
export async function yieldWhenStarved(
  budgetMs: number = STARVATION_BUDGET_MS,
): Promise<void> {
  probeTurn();
  if (performance.now() - turnedAt < budgetMs) return;
  await yieldToEventLoop();
  turnedAt = performance.now();
}
