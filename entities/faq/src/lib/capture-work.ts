import type {
  ContentVisibility,
  EntityInput,
  Message,
  OwnedMutationReceipt,
} from "@brains/sdk/entities";
import type { FaqEntity } from "../schemas/faq";
import type { FaqClassification } from "../schemas/capture";
import type { FaqReconcileEdit } from "./reconcile-faq";

export interface FaqCaptureOperation<TEdit extends FaqReconcileEdit> {
  get(): Promise<OwnedMutationReceipt | null>;
  complete(
    proposal:
      | { operation: "none" }
      | { operation: "create"; entity: EntityInput<FaqEntity> }
      | { operation: "update"; edit: TEdit; entity: FaqEntity },
  ): Promise<OwnedMutationReceipt>;
}

/** Capture operates on admitted edits/receipts; it cannot select a native namespace. */
export interface FaqCaptureWork<TEdit extends FaqReconcileEdit> {
  wasClaimed(replyId: string): Promise<boolean>;
  operation(replyId: string): FaqCaptureOperation<TEdit>;
  messages(
    conversationId: string,
    range: { start: number; end: number },
  ): Promise<Message[]>;
  classify(question: string, answer: string): Promise<FaqClassification>;
  findSame(request: {
    content: string;
    visibility: ContentVisibility;
  }): Promise<FaqEntity | undefined>;
  read(id: string, visibility: ContentVisibility): Promise<TEdit | null>;
  idTaken(id: string): Promise<boolean>;
}
