import { AsyncLocalStorage } from "node:async_hooks";
import { registerTelemetry } from "ai";
import { callInputTokens, callOutputTokens } from "./reference-tokens";

/** What a turn's model calls came to, counted by the reference tokenizer. */
export interface TurnMeasure {
  calls: number;
  referenceTokens: number;
}

const turns = new AsyncLocalStorage<TurnMeasure>();
let registered = false;

/**
 * The AI SDK reports every model call to globally registered telemetry,
 * the brain's own bundled copy included; a call counts toward the turn whose
 * scope it runs in, so background work outside the turn stays out.
 */
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerTelemetry({
    onLanguageModelCallStart: (event) => {
      const turn = turns.getStore();
      if (!turn) return;
      turn.calls += 1;
      turn.referenceTokens += callInputTokens(event);
    },
    onLanguageModelCallEnd: (event) => {
      const turn = turns.getStore();
      if (!turn) return;
      turn.referenceTokens += callOutputTokens(event.content);
    },
  });
}

/** Runs a turn and counts the model calls it makes. */
export async function measureTurn<T>(
  run: () => Promise<T>,
): Promise<TurnMeasure & { value: T }> {
  ensureRegistered();
  const turn: TurnMeasure = { calls: 0, referenceTokens: 0 };
  const value = await turns.run(turn, run);
  return { value, ...turn };
}
