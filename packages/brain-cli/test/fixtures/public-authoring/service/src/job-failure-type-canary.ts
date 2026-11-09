import {
  SdkError,
  defineJob,
  defineServicePlugin,
  defineTool,
  sdkErrorCodeSchema,
  z,
  type SdkErrorCode,
} from "@rizom/brain/services";

const lookup = defineJob({
  name: "lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ found: z.boolean() }),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const jobFailureTypeCanary = defineServicePlugin(
  { id: "job-failure-canary", config: z.object({}) },
  {
    jobs: () => [
      lookup.handle(async ({ input }) => {
        if (input.id === "") {
          throw new SdkError("not_found", { message: "No id to look up" });
        }
        return { found: true };
      }),
    ],
    tools: ({ jobs }) => [
      defineTool({
        name: "lookup-outcome",
        description: "Why a lookup failed, as its code",
        input: z.object({ jobId: z.string() }),
        output: z.object({
          missing: z.boolean(),
          code: sdkErrorCodeSchema.optional(),
        }),
        async execute({ input }) {
          const status = await jobs.status(lookup, input.jobId);
          const code: SdkErrorCode | undefined = status?.code;
          const rejected = (): void => {
            // @ts-expect-error A code is a closed vocabulary, not any string.
            const wrong: "teapot" | undefined = status?.code;
            void wrong;
          };
          void rejected;
          // Check the code, not the message beside it.
          return code
            ? { missing: code === "not_found", code }
            : { missing: false };
        },
      }),
    ],
  },
);
