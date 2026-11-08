import type { z } from "@brains/utils/zod";

/**
 * A job one package owns and another may enqueue, declared once: its full
 * job type (`owner:job`) and the input its handler accepts.
 */
export interface JobContract<TInput extends z.ZodType> {
  readonly type: string;
  readonly input: TInput;
}

export function defineJobContract<TInput extends z.ZodType>(definition: {
  type: string;
  input: TInput;
}): JobContract<TInput> {
  // An unscoped type is rescoped to whichever plugin enqueues it, so it
  // would never reach its owner.
  if (!definition.type.includes(":")) {
    throw new Error(
      `Job contract type "${definition.type}" must name its owner, as "owner:job"`,
    );
  }
  return Object.freeze({ type: definition.type, input: definition.input });
}
