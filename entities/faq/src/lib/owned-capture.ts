import type {
  OwnedEntityEdit,
  OwnedEntityMutations,
} from "@brains/sdk/entities";
import { faq } from "../faq-entity";
import type { FaqEntity } from "../schemas/faq";
import type { FaqCaptureJobData, FaqCaptureResult } from "../schemas/capture";
import { captureFaq } from "./capture-faq";
import type { FaqCaptureWork } from "./capture-work";

export type OwnedFaqCaptureWork = Omit<
  FaqCaptureWork<OwnedEntityEdit<FaqEntity>>,
  "read" | "operation" | "idTaken"
> & {
  readonly mutations: OwnedEntityMutations;
};

/** Installed job binding: FAQ declarations and local operation names, not native storage. */
export function captureOwnedFaq(
  data: FaqCaptureJobData,
  deps: OwnedFaqCaptureWork,
): Promise<FaqCaptureResult> {
  return captureFaq(data, {
    wasClaimed: deps.wasClaimed,
    messages: deps.messages,
    classify: deps.classify,
    findSame: deps.findSame,
    read: (id, visibilityScope) =>
      deps.mutations.read(faq, id, { visibilityScope }),
    operation: (key) => deps.mutations.once(faq, "capture", key),
    idTaken: async (id) =>
      (await deps.mutations.read(faq, id, {
        visibilityScope: "restricted",
      })) !== null,
  });
}
