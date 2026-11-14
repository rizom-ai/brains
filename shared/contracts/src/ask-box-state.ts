import { z } from "@brains/utils/zod";
import { defineSharedState, type SharedState } from "./shared-state";

// Apart from ./ask-box, which the browser chat client bundles: the record is
// named by the package that owns it, and the client carries no package name.
/**
 * Where Web Chat records, in shared runtime state, whether this deployment
 * serves the box boot publicly and on preview: on both, for a configured guest
 * policy or once the owner has switched guest chat on.
 * Site builds may run in a separate worker, where interfaces are not
 * registered and Web Chat's routes are absent; they read this record instead.
 * The serving process writes it on every start and activation change.
 */
export const ASK_BOX_STATE_KEY = "availability";
const askBoxAvailabilitySchema: z.ZodObject<{
  public: z.ZodBoolean;
  preview: z.ZodBoolean;
}> = /* @__PURE__ */ z.object({
  public: z.boolean(),
  preview: z.boolean(),
});
export type AskBoxAvailability = z.output<typeof askBoxAvailabilitySchema>;
/** The record Web Chat shares, which a site's data source reads. */
// Pure, so a browser bundle that imports the contracts without this record
// drops it rather than carrying its name.
export const askBoxAvailabilityState: SharedState<AskBoxAvailability> =
  /* @__PURE__ */ defineSharedState(
    "@brains/web-chat:ask-box",
    askBoxAvailabilitySchema,
  );
