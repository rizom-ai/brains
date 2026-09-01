import type {
  IEntityAINamespace,
  JobEntityAccess,
  JobHandlerContext,
} from "@brains/plugins";
import type { LoggerContract } from "@brains/utils/logger";
import { createMockProgressReporter } from "./mock-progress-reporter";

/**
 * What a job handler is handed, for a test driving one directly.
 *
 * Four generation tests hand-built this, differing only in the logger name
 * and the template prefix — so every field added to `JobHandlerContext`
 * broke four packages that only wanted to call one handler.
 */
export function createTestJobContext<TInput>(options: {
  readonly input: TInput;
  readonly ai: IEntityAINamespace;
  readonly logger: LoggerContract;
  readonly entities: JobEntityAccess;
  readonly conversations: JobHandlerContext<TInput>["conversations"];
  readonly identity: JobHandlerContext<TInput>["identity"];
  /** Scoped template names, as the runtime would resolve them. */
  readonly template: (localName: string) => string;
  readonly domain?: string | undefined;
  readonly profileKinds?: JobHandlerContext<TInput>["profileKinds"] | undefined;
  readonly signal?: AbortSignal | undefined;
}): JobHandlerContext<TInput> {
  return {
    input: options.input,
    ai: options.ai,
    logger: options.logger,
    entities: options.entities,
    conversations: options.conversations,
    identity: options.identity,
    domain: options.domain,
    profileKinds: options.profileKinds ?? {
      getResolved: () => null,
      getSelectedDefinition: () => undefined,
    },
    messaging: { publish: async (): Promise<void> => {} },
    progress: createMockProgressReporter(),
    signal: options.signal ?? new AbortController().signal,
    template: options.template,
    // Declared but unused by generation: these handlers generate, they do
    // not import.
    uploads: {
      read: async (): Promise<never> => {
        throw new Error("This job reads no uploads");
      },
    },
    attachments: {
      resolve: async (): Promise<undefined> => undefined,
    },
  };
}
