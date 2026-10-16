import { MemoryEntityAdapter } from "@brains/action-items";
import {
  decisionMetadataSchema,
  decisionSchema,
  type DecisionEntity,
  type DecisionMetadata,
} from "../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../lib/constants";

export class DecisionAdapter extends MemoryEntityAdapter<
  DecisionEntity,
  DecisionMetadata
> {
  constructor() {
    super({
      entityType: DECISION_ENTITY_TYPE,
      purpose: "A decision recorded from a conversation.",
      schema: decisionSchema,
      metadataSchema: decisionMetadataSchema,
      parseMetadata: decisionMetadataSchema,
    });
  }
}
