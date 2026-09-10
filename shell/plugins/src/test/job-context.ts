import type {
  CreateResult,
  IEntityAINamespace,
  JobEntityAccess,
  JobHandlerContext,
  JobTemplateFormatter,
  ServiceJobBinding,
} from "../index";
import { getServiceJobHandler } from "../index";
import type { LoggerContract } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import { createMockProgressReporter } from "@brains/test-utils";
import { createJobProgress } from "../internal/authoring-readers";
import { createAuthoringEntityAccess } from "../internal/authoring-entity-access";

/**
 * Run a declared job's handler, the way the runtime would.
 *
 * `defineJob().handle()` returns a binding rather than the function, so a
 * test driving one directly needs the runtime's own way of reaching it.
 */
export function runServiceJob<TInput>(
  binding: ServiceJobBinding,
  context: JobHandlerContext<TInput> & {
    readonly templates: JobTemplateFormatter;
  },
): Promise<unknown> {
  return getServiceJobHandler(binding)({
    ...context,
    entities: createAuthoringEntityAccess(context.entities),
  });
}

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
  /** The id the work was queued under; a stand-in unless the test names one. */
  readonly jobId?: string | undefined;
  /** Where progress goes; discarded unless the test watches it. */
  readonly progress?: ProgressContract | undefined;
  /** Rendering a declared template, for a job that formats something. */
  readonly templates?: JobTemplateFormatter | undefined;
  /** A create through another type's route; refused unless the test supplies one. */
  readonly createRouted?: JobHandlerContext<TInput>["createRouted"] | undefined;
  /** Operator-editable prompts; the fallback answers unless the test supplies one. */
  readonly prompts?: JobHandlerContext<TInput>["prompts"] | undefined;
}): JobHandlerContext<TInput> & { readonly templates: JobTemplateFormatter } {
  return {
    input: options.input,
    jobId: options.jobId ?? "test-job",
    ai: options.ai,
    logger: options.logger,
    entities: options.entities,
    createRouted:
      options.createRouted ??
      (async (): Promise<CreateResult> => ({
        success: false,
        error: "This test job creates nothing through another type's route",
      })),
    conversations: options.conversations,
    identity: options.identity,
    domain: options.domain,
    profileKinds: options.profileKinds ?? {
      getResolved: () => null,
      getSelectedDefinition: () => undefined,
    },
    messaging: { publish: async (): Promise<void> => {} },
    prompts: options.prompts ?? {
      resolve: async (_target, fallback): Promise<string> => fallback,
    },
    progress: createJobProgress(
      options.progress ?? createMockProgressReporter(),
    ),
    templates: options.templates ?? {
      format: (name): string => {
        throw new Error(`This test declared no template "${name}"`);
      },
      capabilities: (): null => null,
      generate: (name): never => {
        throw new Error(`This test declared no template "${name}"`);
      },
    },
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
