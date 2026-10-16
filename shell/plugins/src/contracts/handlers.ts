export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;
