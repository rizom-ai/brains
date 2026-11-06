import {
  SdkError,
  defineServicePlugin,
  defineTool,
  sdkErrorCodeSchema,
  sdkErrorSchema,
  z,
  type SdkErrorCode,
  type SdkErrorData,
} from "@rizom/brain/services";

const tally = z.object({
  count: z.string().transform(Number),
  label: z.string().default("ready"),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const setupTypeCanary = defineServicePlugin(
  {
    id: "setup-type-canary",
    config: z.object({ prefix: z.string().default("tally") }),
    // The header fixes the state before any behavior slot is checked.
    setup: ({ config, lifecycle, runtimeState }) => {
      const tallies = runtimeState({ namespace: "tallies", schema: tally });
      lifecycle.onCleanup(async () => {
        await tallies.clear({ keyPrefix: config.prefix });
      });
      return { prefix: config.prefix, tallies };
    },
  },
  {
    // Behavior slots read that state in whatever order they are written.
    tools: ({ state }) => [
      defineTool({
        name: "tally",
        description: "Record a tally",
        input: z.object({ key: z.string(), count: z.string() }),
        output: z.object({ count: z.number(), label: z.string() }),
        async execute({ input }) {
          const key = `${state.prefix}:${input.key}`;
          // Writes take the schema's input; reads return its parsed output.
          await state.tallies.set(key, { count: input.count });
          const first: boolean = await state.tallies.setIfNotExists(
            `${key}:first`,
            { count: input.count, label: "first" },
          );
          void first;
          const read = await state.tallies.get(key);
          if (!read) {
            throw new SdkError("not_found", {
              message: `No tally under ${key}`,
              publicMessage: "Record a tally first",
            });
          }
          const replaced: boolean = await state.tallies.compareAndSet(
            key,
            read,
            { count: String(read.count + 1) },
          );
          void replaced;
          const listed = await state.tallies.list({
            keyPrefix: state.prefix,
            limit: 10,
          });
          const firstCount: number | undefined = listed[0]?.value.count;
          void firstCount;
          const has: boolean = await state.tallies.has(key);
          const removed: boolean = await state.tallies.delete(`${key}:first`);
          void has;
          void removed;

          const rejected = (): void => {
            // @ts-expect-error Writes take the schema's input, not its transformed output.
            void state.tallies.set(key, { count: 1 });
            // @ts-expect-error Reads return the schema's parsed output.
            const wrong: string = read.count;
            void wrong;
            // @ts-expect-error Codes are a closed vocabulary.
            void new SdkError("teapot");
            // @ts-expect-error A store's namespace is fixed when setup asks for it.
            void state.tallies.namespace;
          };
          void rejected;
          return read;
        },
      }),
    ],
    instructions: ({ state }) => `Tallies are kept under "${state.prefix}".`,
  },
);

// A code survives every supported boundary; the wording beside it may change.
export function failureOf(error: unknown): SdkErrorData {
  const reported = sdkErrorSchema.safeParse(error);
  if (reported.success) return reported.data;
  const code: SdkErrorCode = sdkErrorCodeSchema.parse("handler_failed");
  return new SdkError(code).toJSON();
}

export function misplacedBehavior(): void {
  defineServicePlugin({
    id: "misplaced",
    config: z.object({}),
    // @ts-expect-error Behavior is the second argument, not part of the header.
    tools: () => [],
  });
}
