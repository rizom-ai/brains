import {
  recordConflictContract,
  type RecordConflictResponse,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { conflict } from "./conflict-entity";
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
  entities: [conflict],
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
    }
    return {};
  },
});
