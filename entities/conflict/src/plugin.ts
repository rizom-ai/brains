import {
  recordConflictContract,
  resolveConflictContract,
  type RecordConflictResponse,
} from "@brains/contracts";
import {
  defineServicePlugin,
  SdkError,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { getErrorMessage } from "@brains/utils/error";
import { truncateText } from "@brains/utils/string-utils";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { conflict } from "./conflict-entity";
import { conflictImage } from "./conflict-image-entity";
import { ConflictInboxSource } from "./inbox-source";
import { ConflictStore } from "./lib/conflict-store";

const conflictConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/**
 * The conflict type and the service that keeps conflicts. Every way an edit
 * reaches the brain hands one that lost to this service, in whichever
 * process it lost: imports run on the worker, saves on the web process. The
 * Inbox, where an admin applies or dismisses it, is offered where the Inbox
 * is served.
 */
export const conflictPackage: ServicePackageDefinition<
  typeof conflictConfigSchema
> = defineServicePlugin({
  id: "conflicts",
  config: conflictConfigSchema,
  entities: [conflict, conflictImage],
  setup: (context): Record<never, never> => {
    const runtime = serviceRuntime(context);
    const store = new ConflictStore({
      reads: runtime.entityReads,
      writes: runtime.entityWrites,
      permissions: runtime.permissions,
      now: (): Date => new Date(),
    });
    runtime.answer(
      recordConflictContract,
      ({ request }): Promise<RecordConflictResponse> => store.record(request),
      { everyProcess: true },
    );
    if (!runtime.executionOnly) {
      runtime.inboxSource(new ConflictInboxSource(store));
      // An editor settles a save of their own that lost, without the Inbox.
      runtime.answer(
        resolveConflictContract,
        async ({ request }): Promise<{ resolved: true }> => {
          try {
            await store.resolve(request.conflictId, request.action, {
              userId: request.userId,
              permissionLevel: request.permissionLevel,
            });
          } catch (error) {
            // Why a conflict was not resolved is for the person asking: it
            // is about their own edit, and the bus passes on only a message
            // marked as safe to show.
            throw new SdkError("conflict", {
              publicMessage: truncateText(
                getErrorMessage(error, "The conflict could not be resolved"),
                300,
              ),
              cause: error,
            });
          }
          return { resolved: true };
        },
      );
    }
    return {};
  },
});
